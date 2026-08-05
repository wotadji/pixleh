import fs from "fs/promises";
import path from "path";
import SftpClient from "ssh2-sftp-client";

/**
 * Délai max (ms) accordé à une opération SFTP individuelle (connexion, put, get, delete,
 * exists, rmdir). Bug découvert le 06/08/2026 (retour d'Adriel : "en prod je n'arrive pas
 * a uploader les images" / "il upload sans s'arreter pendant des heures") : la librairie
 * ssh2 ne borne QUE la phase de handshake initiale via `readyTimeout` (20s par défaut) —
 * une fois la connexion établie, un transfert qui se bloque (paquets perdus, coupure
 * silencieuse par un pare-feu/NAT intermédiaire, ce qui est fréquent sur de l'hébergement
 * mutualisé) n'a AUCUN timeout : la promesse de `put()`/`get()`/`exists()` ne se résout ni
 * ne rejette jamais, et la requête d'upload reste bloquée indéfiniment (d'où le spinner
 * bloqué à "1/1" pendant des heures, sans erreur). On borne donc explicitement chaque
 * opération ici, plutôt que de compter sur la librairie sous-jacente.
 */
const SFTP_OP_TIMEOUT_MS = 45_000;

class SftpTimeoutError extends Error {
  constructor(op: string) {
    super(`Opération SFTP "${op}" expirée après ${SFTP_OP_TIMEOUT_MS / 1000}s (connexion bloquée) — réessayez.`);
    this.name = "SftpTimeoutError";
  }
}

function withTimeout<T>(promise: Promise<T>, op: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new SftpTimeoutError(op)), SFTP_OP_TIMEOUT_MS);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

/**
 * Interface de stockage abstraite : permet de brancher n'importe quel backend
 * (ici SFTP vers votre serveur de fichiers illimité, ou disque local en dev)
 * sans changer le reste de l'application. Pour ajouter un backend S3 plus tard,
 * il suffit d'implémenter cette interface.
 */
export interface StorageDriver {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  /** Supprime récursivement tout ce qui se trouve sous ce préfixe (ex: `studios/{id}`) —
   * utilisé pour la suppression de compte (RGPD, droit à l'effacement). N'échoue pas si le
   * dossier n'existe pas (déjà vide/jamais créé). */
  deleteDirectory(prefixKey: string): Promise<void>;
}

// ===================== Backend SFTP =====================
// Utilise le serveur de fichiers illimité de l'utilisateur via SFTP.
// Une connexion est ouverte/fermée par opération : c'est plus simple et robuste
// pour un déploiement mutualisé (pas de pool persistant à gérer entre requêtes
// serverless-like de Passenger). Pour un fort volume, envisager un pool dédié.
class SftpStorage implements StorageDriver {
  private rootPath: string;

  constructor() {
    this.rootPath = process.env.SFTP_ROOT_PATH || "/pixistudio-storage";
  }

  private async connect(): Promise<SftpClient> {
    const client = new SftpClient();
    const connectOptions: Record<string, unknown> = {
      host: process.env.SFTP_HOST,
      port: parseInt(process.env.SFTP_PORT || "22", 10),
      username: process.env.SFTP_USERNAME,
      // Ne borne QUE la phase de handshake (voir commentaire SFTP_OP_TIMEOUT_MS) — le
      // vrai filet de sécurité contre un blocage après connexion est withTimeout() plus
      // bas, mais autant réduire aussi ce délai par défaut (20s) pour échouer plus vite
      // si l'hôte est injoignable.
      readyTimeout: 15_000,
      // Débit constaté anormalement bas en prod le 06/08/2026 (retour d'Adriel : une photo
      // de 24 Mo prend ~7-8 min, soit ~55 Ko/s) — on désactive la compression SSH côté
      // client : elle ne sert à rien sur des JPEG déjà compressés (données quasi
      // aléatoires) et peut coûter cher en CPU sur de l'hébergement mutualisé, ralentissant
      // le débit réel plus qu'elle ne réduit les octets transmis.
      algorithms: { compress: ["none"] },
    };
    if (process.env.SFTP_PRIVATE_KEY_PATH) {
      connectOptions.privateKey = await fs.readFile(process.env.SFTP_PRIVATE_KEY_PATH);
    } else {
      connectOptions.password = process.env.SFTP_PASSWORD;
    }
    await withTimeout(client.connect(connectOptions), "connect");
    return client;
  }

  /** Ferme proprement la connexion, sans jamais bloquer l'appelant indéfiniment : si
   * `client.end()` (fermeture "gracieuse", qui attend l'événement 'close') traîne, on
   * force la destruction du socket sous-jacent plutôt que de laisser la requête pendre. */
  private async safeEnd(client: SftpClient): Promise<void> {
    try {
      await withTimeout(client.end(), "end");
    } catch {
      try {
        (client as unknown as { client?: { destroy?: () => void } }).client?.destroy?.();
      } catch {
        // best-effort — rien d'autre à faire si même destroy() échoue.
      }
    }
  }

  private fullPath(key: string) {
    return path.posix.join(this.rootPath, key);
  }

  async put(key: string, data: Buffer): Promise<void> {
    const client = await this.connect();
    try {
      const target = this.fullPath(key);
      const dir = path.posix.dirname(target);
      const dirExists = await withTimeout(client.exists(dir), "exists(dir)");
      if (!dirExists) {
        await withTimeout(client.mkdir(dir, true), "mkdir");
      }
      await withTimeout(client.put(data, target), "put");
    } finally {
      await this.safeEnd(client);
    }
  }

  async get(key: string): Promise<Buffer> {
    const client = await this.connect();
    try {
      const result = await withTimeout(client.get(this.fullPath(key)), "get");
      return Buffer.isBuffer(result) ? result : Buffer.from(result as string);
    } finally {
      await this.safeEnd(client);
    }
  }

  async delete(key: string): Promise<void> {
    const client = await this.connect();
    try {
      const target = this.fullPath(key);
      if (await withTimeout(client.exists(target), "exists")) {
        await withTimeout(client.delete(target), "delete");
      }
    } finally {
      await this.safeEnd(client);
    }
  }

  async exists(key: string): Promise<boolean> {
    const client = await this.connect();
    try {
      const result = await withTimeout(client.exists(this.fullPath(key)), "exists");
      return result !== false;
    } finally {
      await this.safeEnd(client);
    }
  }

  async deleteDirectory(prefixKey: string): Promise<void> {
    const client = await this.connect();
    try {
      const target = this.fullPath(prefixKey);
      if (await withTimeout(client.exists(target), "exists")) {
        await withTimeout(client.rmdir(target, true), "rmdir");
      }
    } finally {
      await this.safeEnd(client);
    }
  }
}

// ===================== Backend local (développement) =====================
class LocalStorage implements StorageDriver {
  private rootPath: string;

  constructor() {
    this.rootPath = process.env.LOCAL_STORAGE_PATH || "./storage";
  }

  private fullPath(key: string) {
    return path.join(process.cwd(), this.rootPath, key);
  }

  async put(key: string, data: Buffer): Promise<void> {
    const target = this.fullPath(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, data);
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.fullPath(key));
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.fullPath(key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.fullPath(key));
      return true;
    } catch {
      return false;
    }
  }

  async deleteDirectory(prefixKey: string): Promise<void> {
    await fs.rm(this.fullPath(prefixKey), { recursive: true, force: true });
  }
}

let driver: StorageDriver | null = null;

export function getStorage(): StorageDriver {
  if (driver) return driver;
  driver = process.env.STORAGE_DRIVER === "local" ? new LocalStorage() : new SftpStorage();
  return driver;
}

/** Construit la clé de stockage conventionnelle pour un fichier de galerie. */
export function buildPhotoKey(
  studioId: string,
  galleryId: string,
  photoId: string,
  variant: "original" | "preview" | "thumb",
  ext: string
) {
  return `studios/${studioId}/galleries/${galleryId}/${photoId}/${variant}.${ext}`;
}

/**
 * Clé de stockage d'une vidéo auto-hébergée (upload direct, voir modèle Video et
 * /api/galleries/[id]/videos/upload) — un seul fichier par vidéo (pas de variantes
 * thumb/preview comme pour les photos : le fichier original est servi tel quel, en
 * streaming avec support Range, aussi bien pour la lecture que le téléchargement).
 */
export function buildVideoKey(studioId: string, galleryId: string, videoId: string, ext: string) {
  return `studios/${studioId}/galleries/${galleryId}/videos/${videoId}/original.${ext}`;
}

/**
 * Clé de stockage du logo/photo de profil d'un studio — toujours la même par studio
 * (un seul logo actif à la fois, un nouvel upload remplace le précédent), au contraire
 * des photos de galerie qui ont chacune un id. Voir /api/settings/logo (écriture) et
 * /api/studio-logo/[studioId] (lecture publique, sans contrôle d'accès galerie).
 */
export function buildStudioLogoKey(studioId: string) {
  return `studios/${studioId}/logo.jpg`;
}

/**
 * Clé de stockage de l'image de fond d'une slide de carrousel (site public du studio).
 * `slideId` est généré côté client (voir Réglages > Carrousel) et sert aussi de clé dans
 * le tableau JSON `StudioSettings.carouselSlides` — un studio peut avoir plusieurs slides,
 * contrairement au logo qui est unique. Voir /api/settings/carousel-image/[slideId]
 * (écriture) et /api/studio-carousel/[studioId]/[slideId] (lecture publique).
 */
export function buildCarouselSlideKey(studioId: string, slideId: string) {
  return `studios/${studioId}/carousel/${slideId}.jpg`;
}

/**
 * Clé de stockage de l'image d'un bloc du site marketing pixleh (voir modèle
 * MarketingBlock) — hors de l'arborescence `studios/...` puisque ce n'est pas le contenu
 * d'un studio mais celui de la plateforme elle-même. Voir /api/admin/marketing-blocks/[id]/image
 * (écriture) et /api/marketing-blocks/[id]/image (lecture publique).
 *
 * `slot` distingue plusieurs images au sein d'un même bloc : "main" pour l'image
 * principale (hero, texte enrichi, CTA), "item-<id>" pour l'image d'une pastille de
 * catégorie (id stable généré côté client, voir CategoryItem dans marketingBlocks.ts).
 */
export function buildMarketingBlockImageKey(blockId: string, slot: string = "main") {
  // "main" garde l'ancien nom de fichier ("image.jpg") pour rester compatible avec les
  // images déjà uploadées avant l'introduction des slots multiples.
  if (slot === "main") return `platform/marketing-blocks/${blockId}/image.jpg`;
  const safeSlot = slot.replace(/[^a-zA-Z0-9_-]/g, "");
  return `platform/marketing-blocks/${blockId}/${safeSlot || "main"}.jpg`;
}

/**
 * Clé de stockage de l'image d'un produit du catalogue impression plateforme (voir modèle
 * Product, platformManaged=true) — demande d'Adriel (01/08/2026) : "dans Image (URL) est il
 * possible de passer par l'upload ?". Même logique que buildMarketingBlockImageKey : hors de
 * l'arborescence `studios/...` puisque ce n'est pas le contenu d'un studio mais du catalogue
 * plateforme. Voir /api/admin/print-catalog/[id]/image (écriture) et
 * /api/print-catalog/[id]/image (lecture publique, affichée dans toutes les galeries).
 */
export function buildPrintCatalogImageKey(productId: string) {
  return `platform/print-catalog/${productId}/image.jpg`;
}

/**
 * Clé de stockage d'une pièce jointe attachée à un ClientMessage (réponse depuis le panel
 * Clients, voir POST /api/clients/[id]/messages) — `attachmentId` est généré côté serveur au
 * moment de l'upload (pas par le client), `ext` conserve l'extension d'origine du fichier
 * pour que le Content-Type déduit au téléchargement reste correct.
 */
export function buildClientMessageAttachmentKey(
  studioId: string,
  messageId: string,
  attachmentId: string,
  ext: string
) {
  return `studios/${studioId}/messages/${messageId}/${attachmentId}.${ext}`;
}
