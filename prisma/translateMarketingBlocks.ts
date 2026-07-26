/**
 * Complète les traductions EN/ES/PT/ZH/AR du contenu marketing déjà en base (celui posé par
 * prisma/seedMarketingBlocks.ts) — sans toucher au français existant, qui reste la source de
 * vérité. Traductions rédigées par Claude.
 *
 * Fonctionne par correspondance (page, type de bloc) — chaque page n'ayant qu'un seul bloc
 * par type dans le contenu d'origine, pas besoin de correspondance plus fine. Les éléments de
 * liste (fonctionnalités, pastilles) sont associés par position dans le tableau `items`, en
 * repartant de l'hypothèse que l'ordre n'a pas changé depuis l'amorçage initial.
 *
 * Si tu as déjà réécrit le texte français d'un bloc depuis /admin/site, ce script traduit
 * quand même — mais avec le texte D'ORIGINE (celui ci-dessous), pas ta version modifiée. Dans
 * ce cas, relis/ajuste la traduction correspondante depuis le panel admin après coup.
 *
 * Lancer avec : npx tsx prisma/translateMarketingBlocks.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Loc = "en" | "es" | "pt" | "zh" | "ar";
const LOCS: Loc[] = ["en", "es", "pt", "zh", "ar"];

interface TopTranslations {
  eyebrow?: Partial<Record<Loc, string>>;
  title?: Partial<Record<Loc, string>>;
  subtitle?: Partial<Record<Loc, string>>;
  ctaLabel?: Partial<Record<Loc, string>>;
  secondaryCtaLabel?: Partial<Record<Loc, string>>;
  body?: Partial<Record<Loc, string>>;
}

// -------------------------------------------------------------------------------- HOME HERO
const HOME_HERO: TopTranslations = {
  eyebrow: {
    en: "Platform for photographers",
    es: "Plataforma para fotógrafos",
    pt: "Plataforma para fotógrafos",
    zh: "为摄影师打造的平台",
    ar: "منصة للمصورين",
  },
  title: {
    en: "Built for photographers. Designed to grow your studio.",
    es: "Pensada para fotógrafos. Diseñada para hacer crecer tu estudio.",
    pt: "Pensada para fotógrafos. Feita para fazer seu estúdio crescer.",
    zh: "为摄影师而生，助力工作室成长。",
    ar: "مصممة للمصورين. لتنمية استوديو التصوير الخاص بك.",
  },
  subtitle: {
    en: "Client galleries, print shop, online booking, contracts and a portfolio website — everything you need to run your studio, in one tool.",
    es: "Galerías para clientes, tienda de impresiones, reservas en línea, contratos y sitio web de portafolio — todo lo que necesitas para gestionar tu estudio, en una sola herramienta.",
    pt: "Galerias de clientes, loja de impressões, reservas online, contratos e site de portfólio — tudo o que você precisa para gerir seu estúdio, reunido em uma única ferramenta.",
    zh: "客户相册、印品商店、在线预约、合同和作品网站——管理工作室所需的一切，尽在一个工具中。",
    ar: "معارض للعملاء، متجر مطبوعات، حجز عبر الإنترنت، عقود وموقع عرض أعمال — كل ما تحتاجه لإدارة استوديوك، في أداة واحدة.",
  },
  ctaLabel: {
    en: "Start for free",
    es: "Empezar gratis",
    pt: "Começar gratuitamente",
    zh: "免费开始",
    ar: "ابدأ مجانًا",
  },
  secondaryCtaLabel: {
    en: "See examples",
    es: "Ver ejemplos",
    pt: "Ver exemplos",
    zh: "查看案例",
    ar: "شاهد أمثلة",
  },
};

// ---------------------------------------------------------------------------- HOME FEATURES
const HOME_FEATURES: TopTranslations = {
  eyebrow: { en: "All-in-one", es: "Todo en uno", pt: "Tudo em um", zh: "一体化", ar: "كل شيء في مكان واحد" },
  title: {
    en: "Everything you need, in one place.",
    es: "Todo lo que necesitas, en un solo lugar.",
    pt: "Tudo o que você precisa, em um só lugar.",
    zh: "所需的一切，尽在一处。",
    ar: "كل ما تحتاجه، في مكان واحد.",
  },
  subtitle: {
    en: "A suite built to cover every step of your business — powerful alone, unstoppable together.",
    es: "Una suite pensada para cubrir cada etapa de tu actividad — potente por sí sola, imparable en conjunto.",
    pt: "Um conjunto pensado para cobrir cada etapa da sua atividade — poderoso sozinho, imbatível em conjunto.",
    zh: "一套覆盖业务每个环节的解决方案——单独使用已很强大，组合使用更加出色。",
    ar: "مجموعة مصممة لتغطية كل مرحلة من نشاطك — قوية بمفردها، ولا تُقهر مجتمعة.",
  },
};

const HOME_FEATURE_ITEMS: { title: Partial<Record<Loc, string>>; desc: Partial<Record<Loc, string>> }[] = [
  {
    title: { en: "Client gallery", es: "Galería de clientes", pt: "Galeria do cliente", zh: "客户相册", ar: "معرض العميل" },
    desc: {
      en: "Deliver your photos in beautiful private galleries: favorites, proofing, HD downloads, automatic watermarking.",
      es: "Entrega tus fotos en hermosas galerías privadas: favoritos, selección, descarga en HD, marca de agua automática.",
      pt: "Entregue suas fotos em belas galerias privadas: favoritos, seleção, download em HD, marca d'água automática.",
      zh: "在精美的私人相册中交付照片：收藏、精选、高清下载、自动水印。",
      ar: "سلّم صورك في معارض خاصة أنيقة: مفضلة، مراجعة واختيار، تحميل بدقة عالية، علامة مائية تلقائية.",
    },
  },
  {
    title: { en: "Online store", es: "Tienda en línea", pt: "Loja online", zh: "在线商店", ar: "متجر إلكتروني" },
    desc: {
      en: "Sell prints and digital downloads directly from your galleries, with secure payment.",
      es: "Vende impresiones y descargas digitales directamente desde tus galerías, con pago seguro.",
      pt: "Venda impressões e downloads digitais diretamente das suas galerias, com pagamento seguro.",
      zh: "直接从相册中销售印品和数字下载，支付安全可靠。",
      ar: "بِع المطبوعات والملفات الرقمية مباشرة من معارضك، مع دفع آمن.",
    },
  },
  {
    title: { en: "Booking & contracts", es: "Reservas y contratos", pt: "Reservas e contratos", zh: "预约与合同", ar: "الحجز والعقود" },
    desc: {
      en: "Your clients book a time slot, sign their contract online and receive their invoice.",
      es: "Tus clientes reservan un horario, firman su contrato en línea y reciben su factura.",
      pt: "Seus clientes reservam um horário, assinam o contrato online e recebem a fatura.",
      zh: "客户可预约时段、在线签署合同并收到发票。",
      ar: "يحجز عملاؤك موعدًا، ويوقعون عقدهم عبر الإنترنت، ويستلمون فاتورتهم.",
    },
  },
  {
    title: { en: "Portfolio website", es: "Sitio de portafolio", pt: "Site de portfólio", zh: "作品网站", ar: "موقع عرض الأعمال" },
    desc: {
      en: "A professional portfolio site with your own domain name, no coding required.",
      es: "Un sitio de portafolio profesional con tu propio dominio, sin escribir una sola línea de código.",
      pt: "Um site de portfólio profissional com seu próprio domínio, sem escrever uma linha de código.",
      zh: "拥有专属域名的专业作品网站，无需编写任何代码。",
      ar: "موقع احترافي لعرض أعمالك باسم نطاق خاص بك، دون كتابة أي سطر برمجي.",
    },
  },
];

// -------------------------------------------------------------------------- HOME CATEGORIES
const HOME_CATEGORIES: TopTranslations = {
  eyebrow: { en: "For every style", es: "Para cada estilo", pt: "Para cada estilo", zh: "适合各种风格", ar: "لكل أسلوب" },
  title: {
    en: "Built for every photographer.",
    es: "Hecho para todos los fotógrafos.",
    pt: "Feito para todos os fotógrafos.",
    zh: "为所有摄影师而设计。",
    ar: "مصممة لكل المصورين.",
  },
  subtitle: {
    en: "From weddings to travel to portraits, pixleh adapts to the way you work.",
    es: "De bodas a viajes pasando por retratos, pixleh se adapta a tu forma de trabajar.",
    pt: "De casamentos a viagens, passando por retratos, o pixleh se adapta ao seu jeito de trabalhar.",
    zh: "从婚礼到旅拍再到人像，pixleh 适应您的工作方式。",
    ar: "من حفلات الزفاف إلى السفر مرورًا بالبورتريه، يتكيف pixleh مع أسلوب عملك.",
  },
};

const HOME_CATEGORY_LABELS: Partial<Record<Loc, string>>[] = [
  { en: "Wedding", es: "Boda", pt: "Casamento", zh: "婚礼", ar: "زفاف" },
  { en: "Portrait", es: "Retrato", pt: "Retrato", zh: "人像", ar: "بورتريه" },
  { en: "Family", es: "Familia", pt: "Família", zh: "家庭", ar: "عائلة" },
  { en: "Newborn", es: "Recién nacido", pt: "Recém-nascido", zh: "新生儿", ar: "مولود جديد" },
  { en: "Events", es: "Eventos", pt: "Eventos", zh: "活动", ar: "فعاليات" },
  { en: "Corporate", es: "Corporativo", pt: "Corporativo", zh: "企业", ar: "شركات" },
  { en: "Travel", es: "Viaje", pt: "Viagem", zh: "旅拍", ar: "سفر" },
  { en: "Sport", es: "Deporte", pt: "Esporte", zh: "运动", ar: "رياضة" },
];

// -------------------------------------------------------------------------------- HOME CTA
const HOME_CTA: TopTranslations = {
  title: {
    en: "Start using pixleh today",
    es: "Empieza a usar pixleh hoy",
    pt: "Comece a usar o pixleh hoje",
    zh: "立即开始使用 pixleh",
    ar: "ابدأ استخدام pixleh اليوم",
  },
  subtitle: {
    en: "Free forever. Upgrade whenever you need to.",
    es: "Gratis para siempre. Mejora tu plan cuando lo necesites.",
    pt: "Grátis para sempre. Faça upgrade quando precisar.",
    zh: "永久免费。需要时随时升级。",
    ar: "مجاني إلى الأبد. قم بالترقية عندما تحتاج إلى ذلك.",
  },
  ctaLabel: HOME_HERO.ctaLabel,
};

// ------------------------------------------------------------------------------ EXEMPLES
const EXEMPLES_HERO: TopTranslations = {
  eyebrow: { en: "Examples", es: "Ejemplos", pt: "Exemplos", zh: "案例", ar: "أمثلة" },
  title: {
    en: "What studios create with pixleh",
    es: "Lo que los estudios crean con pixleh",
    pt: "O que os estúdios criam com o pixleh",
    zh: "工作室使用 pixleh 创作的作品",
    ar: "ما يبتكره الاستوديوهات باستخدام pixleh",
  },
  subtitle: {
    en: "A selection of the latest galleries published by studios using pixleh.",
    es: "Una selección de las últimas galerías publicadas por estudios que usan pixleh.",
    pt: "Uma seleção das galerias mais recentes publicadas por estúdios que usam o pixleh.",
    zh: "精选使用 pixleh 的工作室最新发布的相册。",
    ar: "مجموعة مختارة من أحدث المعارض التي نشرتها استوديوهات تستخدم pixleh.",
  },
};

const EXEMPLES_CTA: TopTranslations = {
  title: {
    en: "Want the same result for your studio?",
    es: "¿Quieres el mismo resultado para tu estudio?",
    pt: "Quer o mesmo resultado para o seu estúdio?",
    zh: "想为您的工作室获得同样的效果？",
    ar: "تريد نفس النتيجة لاستوديوك؟",
  },
  subtitle: {
    en: "Create your pixleh studio and publish your own galleries in minutes.",
    es: "Crea tu estudio pixleh y publica tus propias galerías en minutos.",
    pt: "Crie seu estúdio pixleh e publique suas próprias galerias em minutos.",
    zh: "创建您的 pixleh 工作室，几分钟内发布您自己的相册。",
    ar: "أنشئ استوديو pixleh الخاص بك وانشر معارضك الخاصة في دقائق.",
  },
  ctaLabel: HOME_HERO.ctaLabel,
};

// --------------------------------------------------------------------------------- TARIFS
const TARIFS_HERO: TopTranslations = {
  eyebrow: { en: "Pricing", es: "Precios", pt: "Preços", zh: "价格", ar: "الأسعار" },
  title: {
    en: "Start for free, grow at your own pace.",
    es: "Empieza gratis, crece a tu ritmo.",
    pt: "Comece gratuitamente, cresça no seu ritmo.",
    zh: "免费开始，按自己的节奏成长。",
    ar: "ابدأ مجانًا، وتطور بالوتيرة التي تناسبك.",
  },
  subtitle: {
    en: "Every plan includes a free account to try pixleh. Change or cancel anytime.",
    es: "Todos los planes incluyen una cuenta gratuita para probar pixleh. Cambia o cancela cuando quieras.",
    pt: "Todos os planos incluem uma conta gratuita para conhecer o pixleh. Mude ou cancele quando quiser.",
    zh: "所有套餐均包含免费账户，供您体验 pixleh。随时可更改或取消。",
    ar: "تشمل جميع الخطط حسابًا مجانيًا لتجربة pixleh. يمكنك التغيير أو الإلغاء في أي وقت.",
  },
};

const TARIFS_CTA: TopTranslations = {
  title: {
    en: "Ready to try pixleh?",
    es: "¿Listo para probar pixleh?",
    pt: "Pronto para experimentar o pixleh?",
    zh: "准备好试用 pixleh 了吗？",
    ar: "هل أنت مستعد لتجربة pixleh؟",
  },
  subtitle: {
    en: "No credit card required to get started.",
    es: "No se necesita tarjeta de crédito para empezar.",
    pt: "Não é necessário cartão de crédito para começar.",
    zh: "无需信用卡即可开始。",
    ar: "لا حاجة إلى بطاقة ائتمان للبدء.",
  },
  ctaLabel: {
    en: "Create my studio",
    es: "Crear mi estudio",
    pt: "Criar meu estúdio",
    zh: "创建我的工作室",
    ar: "إنشاء استوديوي",
  },
};

// ------------------------------------------------------------------------------ A_PROPOS
const A_PROPOS_RICH_TEXT: TopTranslations = {
  eyebrow: { en: "About", es: "Acerca de", pt: "Sobre", zh: "关于我们", ar: "من نحن" },
  title: {
    en: "A platform built so you spend less time on admin, and more time behind the camera.",
    es: "Una plataforma pensada para que dediques menos tiempo a lo administrativo y más detrás de la cámara.",
    pt: "Uma plataforma pensada para você gastar menos tempo com burocracia e mais tempo atrás das lentes.",
    zh: "让您把更多时间留给镜头，而非行政事务。",
    ar: "منصة صُممت لتقضي وقتًا أقل في الأعمال الإدارية، ووقتًا أطول خلف العدسة.",
  },
  body: {
    en: [
      "A photography studio is never just about taking pictures. You also have to deliver the photos, collect payments, get a contract signed, follow up with a client, keep a website up to date. Each of these steps usually lives in a different tool — and that's exactly the fragmentation pixleh was built to remove.",
      "pixleh brings together, in one place, what would otherwise take five separate subscriptions: client galleries with proofing and downloads, a shop for prints and digital files, online booking, e-signed contracts, invoices, and a portfolio website in your own style. The idea isn't to stack features, but to let a photographer run their entire business without juggling multiple platforms or re-entering the same information three times.",
      "pixleh is a young, actively developed product — which means two things. First, that we move fast: every piece of feedback from a studio using the platform directly shapes what gets built next. Second, that we'd rather announce a feature once it actually works than promise it in advance.",
      "pixleh is published by Groupe Lehwu. We built this platform because we believe a photographer's everyday tools should be as polished as their own work: fast, reliable, and designed around the relationship with their own clients — not just to tick a list of features.",
    ].join("\n\n"),
    es: [
      "Un estudio de fotografía nunca se limita a tomar fotos. También hay que entregar las fotos, cobrar los pedidos, hacer firmar un contrato, dar seguimiento a un cliente, mantener un sitio web al día. Cada una de estas etapas suele existir en una herramienta diferente — y es precisamente esa fragmentación la que pixleh fue diseñado para eliminar.",
      "pixleh reúne en un solo lugar lo que, de otro modo, requeriría cinco suscripciones distintas: galerías para clientes con selección y descarga, tienda de impresiones y archivos digitales, reservas en línea, contratos con firma electrónica, facturas y un sitio de portafolio a tu imagen. La idea no es acumular funciones, sino permitir que un fotógrafo gestione toda su actividad sin alternar entre varias plataformas ni volver a introducir la misma información tres veces.",
      "pixleh es un producto joven, desarrollado activamente — lo que significa dos cosas. Primero, que avanzamos rápido: cada comentario de un estudio que usa la plataforma influye directamente en lo que se construye después. Segundo, que preferimos anunciar una función cuando realmente funciona, en lugar de prometerla de antemano.",
      "pixleh es publicado por Groupe Lehwu. Construimos esta plataforma porque creemos que las herramientas del día a día de un fotógrafo deberían estar tan cuidadas como su propio trabajo: rápidas, fiables y pensadas para la relación con sus propios clientes — no solo para marcar una lista de funciones.",
    ].join("\n\n"),
    pt: [
      "Um estúdio de fotografia nunca se resume a tirar fotos. É preciso também entregar as fotos, receber os pedidos, fazer assinar um contrato, acompanhar um cliente, manter um site atualizado. Cada uma dessas etapas normalmente existe em uma ferramenta diferente — e é exatamente essa fragmentação que o pixleh foi criado para eliminar.",
      "O pixleh reúne em um só lugar o que, em outro caso, exigiria cinco assinaturas diferentes: galerias de clientes com seleção e download, loja de impressões e arquivos digitais, reservas online, contratos com assinatura eletrônica, faturas e um site de portfólio com a sua cara. A ideia não é empilhar funcionalidades, mas permitir que um fotógrafo gerencie toda a sua atividade sem alternar entre várias plataformas nem inserir as mesmas informações três vezes.",
      "O pixleh é um produto jovem, em desenvolvimento ativo — o que significa duas coisas. Primeiro, que avançamos rápido: cada retorno de um estúdio que usa a plataforma influencia diretamente o que é construído em seguida. Segundo, que preferimos anunciar uma funcionalidade quando ela realmente funciona, em vez de prometê-la antecipadamente.",
      "O pixleh é publicado pelo Groupe Lehwu. Construímos esta plataforma porque acreditamos que as ferramentas do dia a dia de um fotógrafo deveriam ser tão cuidadas quanto o seu próprio trabalho: rápidas, confiáveis e pensadas para o relacionamento com os próprios clientes — não apenas para marcar uma lista de funcionalidades.",
    ].join("\n\n"),
    zh: [
      "摄影工作室的工作从不止于拍摄。还需要交付照片、收款、签署合同、跟进客户、维护网站更新。这些环节通常分散在不同的工具中——而这正是 pixleh 致力于消除的割裂。",
      "pixleh 将原本需要五个不同订阅才能完成的工作整合到一处：带精选与下载功能的客户相册、印品与数字文件商店、在线预约、电子签名合同、发票，以及体现您风格的作品网站。我们的目标不是堆砌功能，而是让摄影师无需在多个平台间切换、也无需重复录入相同信息，就能管理整个业务。",
      "pixleh 是一款年轻且持续开发的产品——这意味着两点。首先，我们的迭代速度很快：每一位使用该平台的工作室的反馈都会直接影响接下来的开发方向。其次，我们更愿意在功能真正可用后再发布，而不是提前承诺。",
      "pixleh 由 Groupe Lehwu 出品。我们打造这个平台，是因为我们相信摄影师日常使用的工具应当和他们的作品一样精致：快速、可靠，并且真正围绕与客户的关系而设计——而不仅仅是为了罗列一堆功能。",
    ].join("\n\n"),
    ar: [
      "لا يقتصر عمل استوديو التصوير أبدًا على التقاط الصور فقط. فهو يتطلب أيضًا تسليم الصور، وتحصيل المدفوعات، وتوقيع العقود، ومتابعة العملاء، والحفاظ على تحديث الموقع الإلكتروني. عادة ما توجد كل خطوة من هذه الخطوات في أداة مختلفة — وهذا التشتت بالتحديد ما صُمم pixleh لإزالته.",
      "يجمع pixleh في مكان واحد ما كان سيتطلب، لولا ذلك، خمسة اشتراكات منفصلة: معارض للعملاء مع مراجعة وتحميل، متجر للمطبوعات والملفات الرقمية، حجز عبر الإنترنت، عقود بتوقيع إلكتروني، فواتير، وموقع لعرض الأعمال بأسلوبك الخاص. الفكرة ليست تكديس الميزات، بل تمكين المصور من إدارة نشاطه بالكامل دون التنقل بين عدة منصات أو إعادة إدخال نفس المعلومات ثلاث مرات.",
      "pixleh منتج فتيّ قيد التطوير النشط — وهذا يعني أمرين. أولًا، أننا نتقدم بسرعة: كل ملاحظة من استوديو يستخدم المنصة تؤثر مباشرة على ما سيُبنى لاحقًا. ثانيًا، أننا نفضل الإعلان عن ميزة بعد أن تعمل فعليًا بدلًا من الوعد بها مسبقًا.",
      "يُنشر pixleh من قبل Groupe Lehwu. لقد بنينا هذه المنصة لأننا نؤمن بأن الأدوات اليومية للمصور يجب أن تكون بنفس إتقان عمله: سريعة وموثوقة ومصممة من أجل العلاقة مع عملائه — لا لمجرد تحقيق قائمة من الميزات.",
    ].join("\n\n"),
  },
};

const A_PROPOS_CTA: TopTranslations = {
  title: TARIFS_CTA.title,
  ctaLabel: TARIFS_CTA.ctaLabel,
};

const TOP_BY_PAGE_TYPE: Record<string, TopTranslations> = {
  "HOME:HERO": HOME_HERO,
  "HOME:FEATURES": HOME_FEATURES,
  "HOME:CATEGORIES": HOME_CATEGORIES,
  "HOME:CTA": HOME_CTA,
  "EXEMPLES:HERO": EXEMPLES_HERO,
  "EXEMPLES:CTA": EXEMPLES_CTA,
  "TARIFS:HERO": TARIFS_HERO,
  "TARIFS:CTA": TARIFS_CTA,
  "A_PROPOS:RICH_TEXT": A_PROPOS_RICH_TEXT,
  "A_PROPOS:CTA": A_PROPOS_CTA,
};

const ITEMS_BY_PAGE_TYPE: Record<string, { title?: Partial<Record<Loc, string>>; desc?: Partial<Record<Loc, string>>; label?: Partial<Record<Loc, string>> }[]> = {
  "HOME:FEATURES": HOME_FEATURE_ITEMS,
  "HOME:CATEGORIES": HOME_CATEGORY_LABELS.map((label) => ({ label })),
};

/** Fusionne les traductions EN/ES/PT/ZH/AR dans une entrée `translations` existante (garde
 * le français et toute langue déjà renseignée intacts, ne complète que ce qui manque). */
function mergeTopTranslations(existing: any, top: TopTranslations): any {
  const translations = { ...(existing?.translations || {}) };
  for (const loc of LOCS) {
    const current = translations[loc] || {};
    const patch: Record<string, string> = {};
    if (top.eyebrow?.[loc]) patch.eyebrow = top.eyebrow[loc]!;
    if (top.title?.[loc]) patch.title = top.title[loc]!;
    if (top.subtitle?.[loc]) patch.subtitle = top.subtitle[loc]!;
    if (top.ctaLabel?.[loc]) patch.ctaLabel = top.ctaLabel[loc]!;
    if (top.secondaryCtaLabel?.[loc]) patch.secondaryCtaLabel = top.secondaryCtaLabel[loc]!;
    if (top.body?.[loc]) patch.body = top.body[loc]!;
    translations[loc] = { ...current, ...patch };
  }
  return { ...existing, translations };
}

function mergeItemTranslations(
  items: any[],
  defs: { title?: Partial<Record<Loc, string>>; desc?: Partial<Record<Loc, string>>; label?: Partial<Record<Loc, string>> }[]
): any[] {
  return items.map((item, i) => {
    const def = defs[i];
    if (!def) return item;
    const translations = { ...(item.translations || {}) };
    for (const loc of LOCS) {
      const current = translations[loc] || {};
      const patch: Record<string, string> = {};
      if (def.title?.[loc]) patch.title = def.title[loc]!;
      if (def.desc?.[loc]) patch.desc = def.desc[loc]!;
      if (def.label?.[loc]) patch.label = def.label[loc]!;
      translations[loc] = { ...current, ...patch };
    }
    return { ...item, translations };
  });
}

async function main() {
  const blocks = await prisma.marketingBlock.findMany();
  let updated = 0;
  for (const block of blocks) {
    const key = `${block.page}:${block.type}`;
    const top = TOP_BY_PAGE_TYPE[key];
    if (!top) continue;

    let data = block.data as any;
    data = mergeTopTranslations(data, top);

    const itemDefs = ITEMS_BY_PAGE_TYPE[key];
    if (itemDefs && Array.isArray(data.items)) {
      data.items = mergeItemTranslations(data.items, itemDefs);
    }

    await prisma.marketingBlock.update({ where: { id: block.id }, data: { data } });
    updated++;
    console.log(`${key} (${block.id}) : traductions complétées.`);
  }
  console.log(`${updated} bloc(s) mis à jour. Vérifie le rendu sur /, /exemples, /tarifs, /a-propos en changeant de langue.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
