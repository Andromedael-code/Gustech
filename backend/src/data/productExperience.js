export const productExperience = {
  'ps4-seminovo': {
    brand: 'Sony',
    isFeatured: true,
    badge: 'Mais vendido',
    highlights: [
      'Console revisado e testado',
      'Excelente custo-beneficio para entrar na linha PlayStation',
      'Ideal para campanha, multiplayer e streaming'
    ],
    specs: [
      { label: 'Armazenamento', value: '500GB' },
      { label: 'Condicao', value: 'Semi-novo revisado' },
      { label: 'Acompanha', value: 'Console, controle e cabos' }
    ],
    gallery: ['images/ps4-seminovo.jpg', 'images/ps4-slim.jpg', 'images/ps4-usado.jpg']
  },
  'ps4-lacrado': {
    brand: 'Sony',
    isFeatured: true,
    badge: 'Premium',
    highlights: [
      'Acabamento impecavel com visual premium',
      'Opcao para quem prioriza confianca e estado de conservacao',
      'Estoque reduzido com alta procura'
    ],
    specs: [
      { label: 'Armazenamento', value: '1TB' },
      { label: 'Condicao', value: 'Lacrado' },
      { label: 'Perfil', value: 'Compra premium' }
    ],
    gallery: ['images/ps4-lacrado.jpg', 'images/ps4-novo.jpg', 'images/ps4-bundle.jpg']
  },
  'switch': {
    brand: 'Nintendo',
    isFeatured: true,
    badge: 'Hibrido',
    highlights: [
      'Jogue na TV ou no modo portatil',
      'Perfeito para multiplayer local e exclusivos Nintendo',
      'Produto com alta rotacao na vitrine'
    ],
    specs: [
      { label: 'Modo', value: 'Portatil e dock' },
      { label: 'Acompanha', value: 'Console, Joy-Cons e dock' },
      { label: 'Publico', value: 'Solo e multiplayer local' }
    ],
    gallery: ['images/switch.jpg']
  },
  'xbox-series-s-combo': {
    brand: 'Microsoft',
    isFeatured: true,
    badge: 'Combo',
    highlights: [
      'Setup pronto para quem quer praticidade',
      'Boa entrada para o ecossistema Xbox',
      'Combo pensado para custo-beneficio'
    ],
    specs: [
      { label: 'Linha', value: 'Xbox Series S' },
      { label: 'Formato', value: 'Combo' },
      { label: 'Perfil', value: 'Digital e compacto' }
    ],
    gallery: ['images/xbox-series-s-combo.jpg', 'images/xbox-one-s.jpg']
  }
};

export function getProductExperience(productId, fallbackImage = '') {
  const entry = productExperience[productId];
  if (!entry) {
    return {
      brand: 'GusTech',
      isFeatured: false,
      badge: '',
      highlights: [],
      specs: [],
      gallery: [fallbackImage].filter(Boolean)
    };
  }

  return {
    brand: entry.brand || 'GusTech',
    isFeatured: Boolean(entry.isFeatured),
    badge: entry.badge || '',
    highlights: Array.isArray(entry.highlights) ? entry.highlights : [],
    specs: Array.isArray(entry.specs) ? entry.specs : [],
    gallery: Array.from(new Set([...(entry.gallery || []), fallbackImage].filter(Boolean)))
  };
}
