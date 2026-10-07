// Árvore padrão de categorias brasileiras (FC2-F1-07). Dados 100% genéricos, versionados e
// estáveis: a `key` é o identificador usado por regras, merchants, importação e código (RN-01)
// e nunca muda. Natureza só em despesa; filho sem `nature` herda a do pai (RN-03).
// `icon` = nome lucide em kebab-case; `colorKey` = token `cat-1..cat-10` (RN-06).

import type { CategoryType, ColorKey, Nature } from './types'

export type DefaultCategory = {
  key: string
  name: string
  type: CategoryType
  /** Natureza explícita. Ausente em filhos que herdam do pai e em receitas. */
  nature?: Nature
  icon: string
  colorKey: ColorKey
  parentKey?: string
  isSystem?: boolean
  sortOrder: number
}

type ChildSpec = {
  key: string
  name: string
  icon: string
  nature?: Nature
  colorKey?: ColorKey
  isSystem?: boolean
}

type RootSpec = {
  key: string
  name: string
  type: CategoryType
  nature?: Nature
  icon: string
  colorKey: ColorKey
  isSystem?: boolean
  children?: ChildSpec[]
}

const EXPENSE_ROOTS: RootSpec[] = [
  {
    key: 'moradia',
    name: 'Moradia',
    type: 'EXPENSE',
    nature: 'MUST',
    icon: 'house',
    colorKey: 'cat-8',
    children: [
      { key: 'aluguel-financiamento', name: 'Aluguel e financiamento', icon: 'key-round' },
      { key: 'condominio', name: 'Condomínio', icon: 'building-2' },
      { key: 'energia', name: 'Energia elétrica', icon: 'zap' },
      { key: 'agua-esgoto', name: 'Água e esgoto', icon: 'droplets' },
      { key: 'gas', name: 'Gás', icon: 'flame' },
      { key: 'internet-telefone', name: 'Internet e telefone', icon: 'wifi' },
      { key: 'iptu-taxas', name: 'IPTU e taxas', icon: 'file-text' },
      { key: 'manutencao-casa', name: 'Manutenção da casa', icon: 'wrench', nature: 'NEED' },
      { key: 'moveis-eletro', name: 'Móveis e eletrodomésticos', icon: 'sofa', nature: 'WANT' },
    ],
  },
  {
    key: 'mercado',
    name: 'Mercado',
    type: 'EXPENSE',
    nature: 'NEED',
    icon: 'shopping-cart',
    colorKey: 'cat-2',
    children: [
      { key: 'supermercado', name: 'Supermercado', icon: 'shopping-basket' },
      { key: 'hortifruti-padaria', name: 'Hortifruti e padaria', icon: 'apple' },
      { key: 'acougue-peixaria', name: 'Açougue e peixaria', icon: 'beef' },
      { key: 'limpeza-higiene', name: 'Limpeza e higiene', icon: 'spray-can' },
    ],
  },
  {
    key: 'alimentacao-fora',
    name: 'Alimentação fora',
    type: 'EXPENSE',
    nature: 'WANT',
    icon: 'utensils',
    colorKey: 'cat-3',
    children: [
      { key: 'restaurantes', name: 'Restaurantes', icon: 'utensils-crossed' },
      { key: 'lanches-cafe', name: 'Lanches e café', icon: 'coffee' },
      { key: 'delivery', name: 'Delivery', icon: 'bike', colorKey: 'cat-4' },
    ],
  },
  {
    key: 'transporte',
    name: 'Transporte',
    type: 'EXPENSE',
    nature: 'NEED',
    icon: 'bus',
    colorKey: 'cat-1',
    children: [
      { key: 'transporte-publico', name: 'Transporte público', icon: 'train-front' },
      { key: 'app-taxi', name: 'Aplicativo e táxi', icon: 'car-taxi-front' },
      { key: 'combustivel', name: 'Combustível', icon: 'fuel' },
      { key: 'estacionamento-pedagio', name: 'Estacionamento e pedágio', icon: 'parking-meter' },
      { key: 'manutencao-veiculo', name: 'Manutenção do veículo', icon: 'car' },
      { key: 'seguro-veiculo', name: 'Seguro do veículo', icon: 'shield-check', nature: 'MUST' },
      {
        key: 'ipva-licenciamento',
        name: 'IPVA e licenciamento',
        icon: 'badge-check',
        nature: 'MUST',
      },
      { key: 'viagens-passagens', name: 'Viagens e passagens', icon: 'plane', nature: 'WANT' },
    ],
  },
  {
    key: 'saude',
    name: 'Saúde',
    type: 'EXPENSE',
    nature: 'NEED',
    icon: 'heart-pulse',
    colorKey: 'cat-9',
    children: [
      { key: 'plano-saude', name: 'Plano de saúde', icon: 'shield-plus', nature: 'MUST' },
      { key: 'consultas-exames', name: 'Consultas e exames', icon: 'stethoscope' },
      { key: 'farmacia', name: 'Farmácia', icon: 'pill' },
      { key: 'terapia-bem-estar', name: 'Terapia e bem-estar', icon: 'brain' },
      { key: 'odontologia', name: 'Odontologia', icon: 'smile' },
    ],
  },
  {
    key: 'educacao',
    name: 'Educação',
    type: 'EXPENSE',
    nature: 'NEED',
    icon: 'graduation-cap',
    colorKey: 'cat-6',
    children: [
      { key: 'mensalidade-curso', name: 'Mensalidade e cursos', icon: 'school' },
      { key: 'material-livros', name: 'Material e livros', icon: 'book-open' },
      { key: 'cursos-online', name: 'Cursos online', icon: 'monitor-play' },
    ],
  },
  {
    key: 'assinaturas',
    name: 'Assinaturas',
    type: 'EXPENSE',
    nature: 'WANT',
    icon: 'repeat',
    colorKey: 'cat-7',
    children: [
      { key: 'streaming', name: 'Streaming de vídeo', icon: 'tv' },
      { key: 'musica-audio', name: 'Música e áudio', icon: 'music' },
      { key: 'software-nuvem', name: 'Software e nuvem', icon: 'cloud' },
      { key: 'jogos', name: 'Jogos', icon: 'gamepad-2' },
      { key: 'jornais-revistas', name: 'Jornais e revistas', icon: 'newspaper' },
    ],
  },
  {
    key: 'lazer',
    name: 'Lazer',
    type: 'EXPENSE',
    nature: 'WANT',
    icon: 'party-popper',
    colorKey: 'cat-5',
    children: [
      { key: 'cinema-shows', name: 'Cinema e shows', icon: 'clapperboard' },
      { key: 'bares-baladas', name: 'Bares e baladas', icon: 'beer' },
      { key: 'hobbies', name: 'Hobbies', icon: 'palette' },
      { key: 'viagens-lazer', name: 'Viagens de lazer', icon: 'tent-tree' },
      { key: 'presentes-datas', name: 'Presentes e datas especiais', icon: 'cake' },
    ],
  },
  {
    key: 'compras',
    name: 'Compras',
    type: 'EXPENSE',
    nature: 'WANT',
    icon: 'shopping-bag',
    colorKey: 'cat-6',
    children: [
      { key: 'roupas-calcados', name: 'Roupas e calçados', icon: 'shirt' },
      { key: 'eletronicos', name: 'Eletrônicos', icon: 'smartphone' },
      { key: 'casa-decoracao', name: 'Casa e decoração', icon: 'lamp' },
      { key: 'beleza-cuidados', name: 'Beleza e cuidados pessoais', icon: 'sparkles' },
    ],
  },
  {
    key: 'familia',
    name: 'Família e pets',
    type: 'EXPENSE',
    nature: 'NEED',
    icon: 'users',
    colorKey: 'cat-10',
    children: [
      { key: 'pet', name: 'Pets', icon: 'paw-print' },
      { key: 'filhos-dependentes', name: 'Filhos e dependentes', icon: 'baby' },
      { key: 'ajuda-familia', name: 'Ajuda à família', icon: 'hand-heart', nature: 'WANT' },
    ],
  },
  {
    key: 'dividas-financeiro',
    name: 'Dívidas e custos financeiros',
    type: 'EXPENSE',
    nature: 'MUST',
    icon: 'landmark',
    colorKey: 'cat-8',
    isSystem: true,
    children: [
      {
        key: 'parcelas-emprestimos',
        name: 'Parcelas de empréstimos',
        icon: 'hand-coins',
        isSystem: true,
      },
      { key: 'juros-encargos', name: 'Juros e encargos', icon: 'percent', isSystem: true },
      { key: 'tarifas-bancarias', name: 'Tarifas bancárias', icon: 'receipt', isSystem: true },
      { key: 'iof', name: 'IOF', icon: 'scale', isSystem: true },
      { key: 'anuidade-cartao', name: 'Anuidade do cartão', icon: 'credit-card', isSystem: true },
      { key: 'multas-atrasos', name: 'Multas e atrasos', icon: 'alarm-clock', isSystem: true },
    ],
  },
  {
    key: 'impostos',
    name: 'Impostos',
    type: 'EXPENSE',
    nature: 'MUST',
    icon: 'receipt-text',
    colorKey: 'cat-8',
    isSystem: true,
    children: [
      { key: 'das-mei', name: 'DAS do MEI', icon: 'stamp', isSystem: true },
      { key: 'outros-impostos', name: 'Outros impostos', icon: 'scroll-text' },
    ],
  },
  {
    key: 'doacoes',
    name: 'Doações',
    type: 'EXPENSE',
    nature: 'WANT',
    icon: 'gift',
    colorKey: 'cat-10',
  },
  {
    key: 'outros-despesas',
    name: 'Outros',
    type: 'EXPENSE',
    nature: 'NEED',
    icon: 'circle-ellipsis',
    colorKey: 'cat-10',
    isSystem: true,
    children: [
      { key: 'sem-categoria', name: 'Sem categoria', icon: 'circle-question-mark', isSystem: true },
    ],
  },
]

const INCOME_ROOTS: RootSpec[] = [
  {
    key: 'renda-mei',
    name: 'Renda MEI',
    type: 'INCOME',
    icon: 'briefcase',
    colorKey: 'cat-2',
    isSystem: true,
    children: [
      { key: 'base-mensal', name: 'Base mensal', icon: 'calendar-check' },
      { key: 'adicional-presencial', name: 'Adicional presencial', icon: 'map-pin' },
    ],
  },
  { key: 'salario-clt', name: 'Salário', type: 'INCOME', icon: 'wallet', colorKey: 'cat-2' },
  { key: 'reembolsos', name: 'Reembolsos', type: 'INCOME', icon: 'undo-2', colorKey: 'cat-1' },
  {
    key: 'rendimentos',
    name: 'Rendimentos de investimentos',
    type: 'INCOME',
    icon: 'trending-up',
    colorKey: 'cat-7',
  },
  {
    key: 'vendas-eventuais',
    name: 'Vendas e bicos',
    type: 'INCOME',
    icon: 'tag',
    colorKey: 'cat-4',
  },
  {
    key: 'outros-receitas',
    name: 'Outras receitas',
    type: 'INCOME',
    icon: 'circle-ellipsis',
    colorKey: 'cat-10',
    isSystem: true,
  },
]

function flatten(roots: readonly RootSpec[]): DefaultCategory[] {
  const result: DefaultCategory[] = []
  roots.forEach((root, rootIndex) => {
    result.push({
      key: root.key,
      name: root.name,
      type: root.type,
      ...(root.nature ? { nature: root.nature } : {}),
      icon: root.icon,
      colorKey: root.colorKey,
      ...(root.isSystem ? { isSystem: true } : {}),
      sortOrder: (rootIndex + 1) * 10,
    })
    root.children?.forEach((child, childIndex) => {
      result.push({
        key: child.key,
        name: child.name,
        type: root.type,
        ...(child.nature ? { nature: child.nature } : {}),
        icon: child.icon,
        colorKey: child.colorKey ?? root.colorKey,
        parentKey: root.key,
        ...(child.isSystem ? { isSystem: true } : {}),
        sortOrder: (childIndex + 1) * 10,
      })
    })
  })
  return result
}

/**
 * Árvore padrão achatada: cada pai vem antes dos seus filhos. Despesas primeiro, depois receitas.
 * `sortOrder` é relativo aos irmãos (múltiplos de 10, para o usuário inserir entre dois itens).
 */
export const DEFAULT_CATEGORIES: readonly DefaultCategory[] = [
  ...flatten(EXPENSE_ROOTS),
  ...flatten(INCOME_ROOTS),
]

/**
 * Categorias de sistema: referenciadas por `key` por outras tasks (juros, tarifas, IOF, DAS,
 * empréstimos, Inbox, renda MEI). Não podem ser arquivadas nem trocar de tipo (RN-05).
 */
export const SYSTEM_CATEGORY_KEYS = [
  'dividas-financeiro',
  'parcelas-emprestimos',
  'juros-encargos',
  'tarifas-bancarias',
  'iof',
  'anuidade-cartao',
  'multas-atrasos',
  'impostos',
  'das-mei',
  'outros-despesas',
  'sem-categoria',
  'renda-mei',
  'outros-receitas',
] as const

export type SystemCategoryKey = (typeof SYSTEM_CATEGORY_KEYS)[number]
