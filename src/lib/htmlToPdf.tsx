import React from "react";
import { Text, View } from "@react-pdf/renderer";

/**
 * Convertit le HTML produit par RichTextEditor.tsx (contentEditable + execCommand — voir ce
 * fichier pour la liste exacte des balises/attributs générés) en éléments @react-pdf/renderer,
 * pour que le PDF final d'un contrat reflète la mise en forme choisie par le studio (gras,
 * italique, souligné, titres, alignement, interligne, listes, citation, séparateur, taille de
 * texte...) au lieu du texte brut aplati précédemment utilisé (tags simplement retirés à la
 * regex, tout le contenu collé bout à bout sur une seule ligne).
 *
 * Pas de dépendance externe de parsing HTML (le sandbox n'a pas d'accès réseau pour installer
 * de paquet) : un mini-parseur maison suffit, la surface HTML à couvrir étant strictement
 * limitée à ce que produit notre propre éditeur (pas d'entrée HTML tierce arbitraire).
 */

interface ElementNode {
  type: "el";
  tag: string;
  attrs: Record<string, string>;
  children: HtmlNode[];
}
interface TextNode {
  type: "text";
  value: string;
}
type HtmlNode = ElementNode | TextNode;

const VOID_TAGS = new Set(["br", "hr", "img"]);
// Balises considérées comme des blocs (chacune démarre un nouveau paragraphe/élément dans le
// PDF) — "div" est inclus car Chrome enveloppe chaque nouvelle ligne dans un <div> par défaut
// quand aucune commande formatBlock explicite n'a été utilisée.
const BLOCK_TAGS = new Set(["p", "div", "h1", "h2", "h3", "blockquote", "hr", "ul", "ol"]);

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

function parseStyleAttr(style?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!style) return out;
  for (const decl of style.split(";")) {
    const idx = decl.indexOf(":");
    if (idx === -1) continue;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const value = decl.slice(idx + 1).trim();
    if (prop && value) out[prop] = value;
  }
  return out;
}

/** Parseur HTML minimal (tokenisation par regex + pile) — tolérant aux balises non fermées
 * (comportement fréquent d'un contentEditable), pas destiné à du HTML arbitraire. */
function parseHtml(html: string): HtmlNode[] {
  const tokens = html.split(/(<[^>]+>)/g).filter((t) => t.length > 0);
  const root: ElementNode = { type: "el", tag: "root", attrs: {}, children: [] };
  const stack: ElementNode[] = [root];
  const attrRegex = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*"([^"]*)"/g;

  for (const token of tokens) {
    if (token.startsWith("<")) {
      const isClosing = token.startsWith("</");
      const isSelfClosing = /\/>\s*$/.test(token);
      const tagMatch = token.match(/^<\/?([a-zA-Z0-9]+)/);
      if (!tagMatch) continue;
      const tag = tagMatch[1].toLowerCase();

      if (isClosing) {
        for (let i = stack.length - 1; i > 0; i--) {
          if (stack[i].tag === tag) {
            stack.length = i;
            break;
          }
        }
        continue;
      }

      const attrs: Record<string, string> = {};
      attrRegex.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = attrRegex.exec(token))) {
        attrs[m[1].toLowerCase()] = m[2];
      }
      const node: ElementNode = { type: "el", tag, attrs, children: [] };
      stack[stack.length - 1].children.push(node);
      if (!isSelfClosing && !VOID_TAGS.has(tag)) {
        stack.push(node);
      }
    } else {
      const value = decodeEntities(token);
      if (value.length === 0) continue;
      stack[stack.length - 1].children.push({ type: "text", value });
    }
  }

  return root.children;
}

interface InlineCtx {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  fontSize?: number;
}

interface BlockCtx {
  lineHeight?: number;
}

function inlineStyle(ctx: InlineCtx, extra?: Record<string, unknown>) {
  return {
    fontWeight: ctx.bold ? 700 : undefined,
    fontStyle: ctx.italic ? ("italic" as const) : undefined,
    textDecoration: ctx.underline ? ("underline" as const) : undefined,
    color: ctx.color,
    fontSize: ctx.fontSize,
    ...extra,
  };
}

function renderInline(nodes: HtmlNode[], ctx: InlineCtx, keyPrefix: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  nodes.forEach((node, i) => {
    const key = `${keyPrefix}-i${i}`;
    if (node.type === "text") {
      out.push(node.value);
      return;
    }
    const { tag, attrs, children } = node;
    if (tag === "br") {
      out.push("\n");
      return;
    }

    const style = parseStyleAttr(attrs.style);
    const nextCtx: InlineCtx = { ...ctx };
    if (tag === "b" || tag === "strong") nextCtx.bold = true;
    if (tag === "i" || tag === "em") nextCtx.italic = true;
    if (tag === "u") nextCtx.underline = true;
    if (style["font-size"]) {
      const px = parseFloat(style["font-size"]);
      if (!Number.isNaN(px)) nextCtx.fontSize = px;
    }
    if (style.color) nextCtx.color = style.color;

    if (tag === "a") {
      out.push(
        <Text key={key} style={inlineStyle(nextCtx, { color: nextCtx.color || "#2563eb", textDecoration: "underline" })}>
          {renderInline(children, nextCtx, key)}
        </Text>
      );
      return;
    }

    out.push(
      <Text key={key} style={inlineStyle(nextCtx)}>
        {renderInline(children, nextCtx, key)}
      </Text>
    );
  });
  return out;
}

function renderBlockElement(node: ElementNode, ctx: BlockCtx, key: string): React.ReactNode {
  const { tag, attrs, children } = node;
  const style = parseStyleAttr(attrs.style);
  const align = style["text-align"] as "left" | "center" | "right" | "justify" | undefined;

  if (tag === "hr") {
    return <View key={key} style={{ borderBottomWidth: 1, borderColor: "#d1d5db", marginVertical: 10 }} />;
  }

  if (tag === "ul" || tag === "ol") {
    const items = children.filter((c): c is ElementNode => c.type === "el" && c.tag === "li");
    return (
      <View key={key} style={{ marginBottom: 6 }}>
        {items.map((li, idx) => (
          <View key={`${key}-li${idx}`} style={{ flexDirection: "row", marginBottom: 2, paddingLeft: 4 }}>
            <Text style={{ width: 16, lineHeight: ctx.lineHeight }}>{tag === "ol" ? `${idx + 1}.` : "•"}</Text>
            <Text style={{ flex: 1, lineHeight: ctx.lineHeight }}>{renderInline(li.children, {}, `${key}-li${idx}`)}</Text>
          </View>
        ))}
      </View>
    );
  }

  if (tag === "blockquote") {
    return (
      <View key={key} style={{ marginBottom: 8, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: "#d1d5db" }}>
        <Text style={{ fontStyle: "italic", color: "#6b7280", lineHeight: ctx.lineHeight, textAlign: align }}>
          {renderInline(children, {}, key)}
        </Text>
      </View>
    );
  }

  if (tag === "h1" || tag === "h2" || tag === "h3") {
    const size = tag === "h1" ? 18 : tag === "h2" ? 15 : 13;
    return (
      <View key={key} style={{ marginTop: 8, marginBottom: 6 }}>
        <Text style={{ fontWeight: 700, fontSize: size, textAlign: align }}>
          {renderInline(children, { bold: true }, key)}
        </Text>
      </View>
    );
  }

  // p / div — paragraphe générique
  return (
    <View key={key} style={{ marginBottom: 6 }}>
      <Text style={{ lineHeight: ctx.lineHeight, textAlign: align }}>{renderInline(children, {}, key)}</Text>
    </View>
  );
}

function renderBlocks(nodes: HtmlNode[], ctx: BlockCtx, keyPrefix: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let pendingInline: HtmlNode[] = [];
  let pendingIndex = 0;

  function flushPendingInline() {
    if (pendingInline.length === 0) return;
    const key = `${keyPrefix}-p${pendingIndex++}`;
    out.push(
      <View key={key} style={{ marginBottom: 6 }}>
        <Text style={{ lineHeight: ctx.lineHeight }}>{renderInline(pendingInline, {}, key)}</Text>
      </View>
    );
    pendingInline = [];
  }

  nodes.forEach((node, i) => {
    const key = `${keyPrefix}-b${i}`;
    if (node.type === "text") {
      if (node.value.trim().length === 0) return;
      pendingInline.push(node);
      return;
    }
    const { tag, attrs, children } = node;

    // Conteneur transparent posant l'interligne global (voir RichTextEditor.setLineHeight)
    // — ne produit pas son propre bloc, propage juste line-height aux enfants.
    if (tag === "div" && attrs["data-lh"] !== undefined) {
      const wrapperStyle = parseStyleAttr(attrs.style);
      const lh = wrapperStyle["line-height"] ? parseFloat(wrapperStyle["line-height"]) : undefined;
      flushPendingInline();
      out.push(...renderBlocks(children, { ...ctx, lineHeight: lh ?? ctx.lineHeight }, key));
      return;
    }

    if (BLOCK_TAGS.has(tag)) {
      flushPendingInline();
      out.push(renderBlockElement(node, ctx, key));
      return;
    }

    // Élément inline (ou balise inconnue) à la racine d'un bloc — accumulé dans le
    // paragraphe implicite en cours.
    pendingInline.push(node);
  });

  flushPendingInline();
  return out;
}

/** Point d'entrée : HTML éditeur → tableau d'éléments @react-pdf/renderer (Views/Text), à
 * placer dans un <View>/<Page> parent du document. */
export function renderHtmlToPdf(html: string): React.ReactNode[] {
  if (!html || !html.trim()) return [];
  const nodes = parseHtml(html);
  return renderBlocks(nodes, {}, "root");
}
