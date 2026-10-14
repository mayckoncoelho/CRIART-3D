/**
 * CRIART 3D - MakerWorld Product Integration (Módulo puro para navegador e Node.js)
 * Funções para normalizar URLs, extrair model/profile, gerar sourceKey determinístico,
 * validar manifestos e montar payload compatível com o catálogo CRIART 3D.
 */

import { calculatePrintPrice, DEFAULT_PRINT_PRICING } from './pricing-calculator.js';

export const MAKERWORLD_DOMAIN = 'makerworld.com';
export const MAKERWORLD_VERSION = '1.0';

/**
 * Normaliza um texto para uso seguro em chaves e slugs.
 */
export function slugify(text = '') {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'padrao';
}

/**
 * Normaliza uma URL do MakerWorld e extrai modelId e profileId.
 * Suporta formatos:
 * - https://makerworld.com/en/models/123456
 * - https://makerworld.com/en/models/123456#profileId-789012
 * - https://makerworld.com/en/models/123456?profileId=789012
 * - https://makerworld.com/en/models/123456-nome-do-modelo#profileId-789012
 * - https://makerworld.com/models/123456
 * - https://makerworld.com/en/models/123456/profile/789012
 */
export function normalizeMakerWorldUrl(rawUrl = '') {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return {
      isValid: false,
      error: 'URL não fornecida ou inválida.',
      canonicalUrl: '',
      modelId: null,
      profileId: null,
      originalUrl: '',
    };
  }

  const trimmed = rawUrl.trim();
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      isValid: false,
      error: 'Formato de URL inválido.',
      canonicalUrl: '',
      modelId: null,
      profileId: null,
      originalUrl: trimmed,
    };
  }

  if (parsed.protocol !== 'https:') {
    return {
      isValid: false,
      error: 'URL deve utilizar o protocolo seguro https:.',
      canonicalUrl: '',
      modelId: null,
      profileId: null,
      originalUrl: trimmed,
    };
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (hostname !== MAKERWORLD_DOMAIN) {
    return {
      isValid: false,
      error: 'URL deve ser do domínio makerworld.com.',
      canonicalUrl: '',
      modelId: null,
      profileId: null,
      originalUrl: trimmed,
    };
  }

  // 1. Extração do modelId
  // Procura por /models/123456 ou /models/123456-slug
  let modelId = null;
  const modelMatch = parsed.pathname.match(/\/models\/(\d+)(?:-[^\/?#]*)?/i);
  if (modelMatch) {
    modelId = modelMatch[1];
  } else {
    // Fallback para query param ?id=123456 ou ?modelId=123456
    const idParam = parsed.searchParams.get('id') || parsed.searchParams.get('modelId');
    if (idParam && /^\d+$/.test(idParam)) {
      modelId = idParam;
    }
  }

  if (!modelId) {
    return {
      isValid: false,
      error: 'ID do modelo MakerWorld não encontrado na URL.',
      canonicalUrl: '',
      modelId: null,
      profileId: null,
      originalUrl: trimmed,
    };
  }

  // 2. Extração do profileId
  let profileId = null;

  // A) No hash: #profileId-789012, #profile-789012 ou #789012
  const hashMatch = parsed.hash.match(/profile(?:Id)?[-=](\d+)/i) || parsed.hash.match(/^#(\d+)$/);
  if (hashMatch) {
    profileId = hashMatch[1];
  }

  // B) No searchParams: ?profileId=789012 ou ?profile=789012
  if (!profileId) {
    const pParam = parsed.searchParams.get('profileId') || parsed.searchParams.get('profile');
    if (pParam && /^\d+$/.test(pParam)) {
      profileId = pParam;
    }
  }

  // C) No path: /profile/789012
  if (!profileId) {
    const pathMatch = parsed.pathname.match(/\/profile\/(\d+)/i);
    if (pathMatch) {
      profileId = pathMatch[1];
    }
  }

  const canonicalUrl = `https://makerworld.com/en/models/${modelId}${profileId ? `#profileId-${profileId}` : ''}`;

  return {
    isValid: true,
    canonicalUrl,
    modelId,
    profileId,
    originalUrl: trimmed,
  };
}

/**
 * Monta uma solicitação segura e padronizada para o agente processar um anúncio.
 */
export function buildMakerWorldAgentRequest(rawUrl = '') {
  const normalized = normalizeMakerWorldUrl(rawUrl);
  if (!normalized.isValid) {
    return {
      isValid: false,
      error: normalized.error,
      requestText: '',
      normalized,
    };
  }

  const lines = [
    'CRIART 3D — processar anúncio do MakerWorld',
    `Link: ${normalized.originalUrl || normalized.canonicalUrl}`,
    `Modelo: ${normalized.modelId}`,
    `Perfil: ${normalized.profileId || 'identificar no anúncio'}`,
    '',
    'Acesse o anúncio e prepare o cadastro da peça física para a CRIART 3D.',
    'Extraia as fotos relacionadas ao perfil selecionado e produza uma descrição comercial original em português.',
    'Não publique antes de confirmar perfil, gramagem, tempo de impressão, preço positivo e imagens locais válidas.',
  ];

  return {
    isValid: true,
    error: null,
    requestText: lines.join('\n'),
    normalized,
  };
}

/**
 * Gera chave estável única por modelo e perfil no formato `makerworld:<modelId>:<profileId|slug>`.
 */
export function buildSourceKey({ modelId, profileId, profileName, sourceUrl } = {}) {
  let resolvedModelId = modelId;
  let resolvedProfileId = profileId;

  if (!resolvedModelId && sourceUrl) {
    const norm = normalizeMakerWorldUrl(sourceUrl);
    if (norm.isValid) {
      resolvedModelId = norm.modelId;
      if (!resolvedProfileId && norm.profileId) {
        resolvedProfileId = norm.profileId;
      }
    }
  }

  if (!resolvedModelId) {
    throw new Error('Não foi possível gerar sourceKey: modelId ausente.');
  }

  if (resolvedProfileId) {
    return `makerworld:${resolvedModelId}:${resolvedProfileId}`;
  }

  if (profileName && String(profileName).trim()) {
    return `makerworld:${resolvedModelId}:${slugify(profileName)}`;
  }

  return `makerworld:${resolvedModelId}:default`;
}

/**
 * Valida o manifesto de importação do MakerWorld.
 * Requisitos estritos para publicação:
 * - nome não vazio
 * - descricao não vazia
 * - sourceUrl válida do MakerWorld
 * - perfil identificável (profileId ou profileName)
 * - gramas > 0
 * - tempo > 0
 * - preco > 0 (calculado ou explícito)
 * - se options.requireImages = true, ao menos uma imagem deve estar presente
 */
export function validateMakerWorldManifest(manifest = {}, options = {}) {
  const errors = [];

  if (!manifest || typeof manifest !== 'object') {
    return {
      isValid: false,
      errors: ['Manifesto inválido ou nulo.'],
      normalized: null,
    };
  }

  const nome = String(manifest.nome || '').trim();
  if (!nome || nome.length < 2) {
    errors.push('Nome do produto é obrigatório e deve ter ao menos 2 caracteres.');
  }

  const descricao = String(manifest.descricao || '').trim();
  if (!descricao || descricao.length < 3) {
    errors.push('Descrição do produto é obrigatória e deve ter ao menos 3 caracteres.');
  }

  const sourceUrl = String(manifest.sourceUrl || '').trim();
  const urlNorm = normalizeMakerWorldUrl(sourceUrl);
  if (!urlNorm.isValid) {
    errors.push(`URL do MakerWorld inválida: ${urlNorm.error || 'Formato incorreto.'}`);
  }

  const profileId = String(manifest.profileId || urlNorm.profileId || '').trim() || null;
  const profileName = String(manifest.profileName || '').trim() || (profileId ? `Perfil #${profileId}` : '');
  if (!profileId && !profileName) {
    errors.push('Perfil de impressão identificável é obrigatório (profileId ou profileName).');
  }

  const filamentGrams = Number(manifest.filamentGrams ?? manifest.gramas ?? 0);
  if (!Number.isFinite(filamentGrams) || filamentGrams <= 0) {
    errors.push('Gramas de filamento devem ser informadas e maiores que zero.');
  }

  const printTimeMinutes = Number(
    manifest.printTimeMinutes ??
    manifest.tempoMinutos ??
    ((Number(manifest.horas) || 0) * 60 + (Number(manifest.minutos) || 0))
  );
  if (!Number.isFinite(printTimeMinutes) || printTimeMinutes <= 0) {
    errors.push('Tempo de impressão deve ser informado e maior que zero.');
  }

  // Preço explícito ou calculado
  let preco = Number(manifest.preco);
  if (!Number.isFinite(preco) || preco <= 0) {
    if (filamentGrams > 0 && printTimeMinutes > 0) {
      try {
        const pricingInputs = {
          ...DEFAULT_PRINT_PRICING,
          ...(manifest.pricingInputs || {}),
          gramas: filamentGrams,
          printTimeMinutes,
        };
        const calc = calculatePrintPrice(pricingInputs);
        preco = Number(calc.final.toFixed(2));
      } catch (err) {
        errors.push(`Falha no cálculo do preço: ${err.message}`);
      }
    } else {
      errors.push('Preço deve ser maior que zero ou passível de cálculo com gramas e tempo.');
    }
  }

  if (Number.isFinite(preco) && preco <= 0) {
    errors.push('Preço final deve ser maior que zero.');
  }

  if (options.requireImages) {
    const imagesCount = Number(options.imagesCount ?? (manifest.images?.length || manifest.imageUrls?.length || 0));
    if (imagesCount < 1) {
      errors.push('Ao menos uma imagem deve ser selecionada para o produto.');
    }
  }

  let sourceKey = null;
  if (urlNorm.isValid && (profileId || profileName)) {
    try {
      sourceKey = buildSourceKey({
        modelId: urlNorm.modelId,
        profileId,
        profileName,
      });
    } catch (e) {
      errors.push(`Erro ao gerar sourceKey: ${e.message}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    normalized: {
      nome,
      descricao,
      sourceUrl,
      canonicalUrl: urlNorm.canonicalUrl,
      modelId: urlNorm.modelId,
      profileId,
      profileName: profileName || 'Padrão',
      filamentGrams,
      printTimeMinutes,
      sourceKey,
      material: String(manifest.material || 'PLA').trim(),
      colors: Array.isArray(manifest.colors) ? manifest.colors : (manifest.colors ? [String(manifest.colors)] : []),
      dimensions: manifest.dimensions || null,
      preco,
    },
  };
}

/**
 * Constrói o payload completo compatível com Firestore para um produto MakerWorld.
 * Opções aceitas:
 * - imageUrls: array de URLs (deve ser do Firebase Storage, nunca URLs externas do MakerWorld!)
 * - imagePaths: array de paths do Firebase Storage
 * - existingProduct: objeto do produto atual caso seja uma atualização
 * - importedAt: ISO string opcional
 * - requireImages: boolean (padrão true para publicação segura)
 */
export function buildMakerWorldProductPayload(manifest = {}, options = {}) {
  const requireImages = options.requireImages !== false;
  const existingProduct = options.existingProduct || null;

  // Imagens: se não houver novas e existir produto prévio, reutiliza as existentes
  let imageUrls = Array.isArray(options.imageUrls) ? [...options.imageUrls] : [];
  let imagePaths = Array.isArray(options.imagePaths) ? [...options.imagePaths] : [];

  if (imageUrls.length === 0 && existingProduct && Array.isArray(existingProduct.imageUrls)) {
    imageUrls = [...existingProduct.imageUrls];
    imagePaths = Array.isArray(existingProduct.imagePaths) ? [...existingProduct.imagePaths] : [];
  }

  // Não permitir URLs externas do MakerWorld como fotos do produto
  const invalidExternalUrls = imageUrls.filter(u => /(?:makerworld|bambulab)/i.test(u));
  if (invalidExternalUrls.length > 0) {
    throw new Error('URLs externas do MakerWorld não são permitidas como imageUrls. As fotos devem ser enviadas ao Storage.');
  }

  const validation = validateMakerWorldManifest(manifest, {
    requireImages,
    imagesCount: imageUrls.length,
  });

  if (!validation.isValid) {
    throw new Error(`Validação do manifesto falhou: ${validation.errors.join('; ')}`);
  }

  const { normalized } = validation;

  // Cálculo de precificação
  const pricingInputs = {
    ...DEFAULT_PRINT_PRICING,
    ...(manifest.pricingInputs || {}),
    gramas: normalized.filamentGrams,
    printTimeMinutes: normalized.printTimeMinutes,
  };

  const pricingResult = calculatePrintPrice(pricingInputs);
  const rawPreco = manifest.preco !== undefined && manifest.preco !== null
    ? Number(manifest.preco)
    : pricingResult.final;

  if (!Number.isFinite(rawPreco) || rawPreco <= 0) {
    throw new Error('Preço do produto deve ser um número finito maior que zero.');
  }

  const preco = Number(rawPreco.toFixed(2));

  const sourceKey = normalized.sourceKey || buildSourceKey({
    modelId: normalized.modelId,
    profileId: normalized.profileId,
    profileName: normalized.profileName,
  });

  const payload = {
    nome: normalized.nome,
    descricao: normalized.descricao,
    preco,
    ativo: true,
    imageUrls,
    imagePaths,
    sourceKey,
    makerworld: {
      sourceUrl: normalized.sourceUrl,
      canonicalUrl: normalized.canonicalUrl,
      modelId: normalized.modelId,
      profileId: normalized.profileId,
      profileName: normalized.profileName,
      filamentGrams: normalized.filamentGrams,
      printTimeMinutes: normalized.printTimeMinutes,
      material: normalized.material,
      colors: normalized.colors,
      dimensions: normalized.dimensions,
      pricingInputs,
      pricingResult: {
        material: pricingResult.material,
        operacao: pricingResult.operacao,
        base: pricingResult.base,
        risco: pricingResult.risco,
        custo: pricingResult.custo,
        markupPercent: pricingResult.markupPercent,
        bruto: pricingResult.bruto,
        descontoAplicado: pricingResult.descontoAplicado,
        final: pricingResult.final,
        precoPorUnidade: pricingResult.precoPorUnidade,
      },
      importedAt: options.importedAt || new Date().toISOString(),
      version: MAKERWORLD_VERSION,
    },
  };

  if (existingProduct?.createdAt) {
    payload.createdAt = existingProduct.createdAt;
  }

  return payload;
}

/**
 * Verifica se um produto existente corresponde a uma duplicata pelo mesmo modelo + mesmo perfil.
 * Usa sourceKey como identificador principal determinístico e URL somente quando identificar o mesmo perfil.
 * Nunca colide perfis diferentes do mesmo modelo.
 */
export function isDuplicateMakerWorldProduct(product = {}, candidateSourceKey = '', candidateUrl = '') {
  if (!product) return false;

  const productSourceKey = product.sourceKey || product.makerworld?.sourceKey || '';

  // 1. sourceKey é o identificador principal determinístico (modelId + profileId ou slug de profileName)
  if (candidateSourceKey && productSourceKey) {
    return productSourceKey === candidateSourceKey;
  }

  if (candidateSourceKey) {
    if (product.sourceKey === candidateSourceKey || product.makerworld?.sourceKey === candidateSourceKey) {
      return true;
    }
  }

  // 2. Validação por URL: aceita como duplicata somente quando identificar o mesmo modelo e o mesmo perfil
  if (candidateUrl) {
    const normCand = normalizeMakerWorldUrl(candidateUrl);
    const pMw = product.makerworld;
    if (normCand.isValid && pMw) {
      // Devem ser obrigatoriamente do mesmo modelo
      if (normCand.modelId && pMw.modelId && normCand.modelId === pMw.modelId) {
        // Se ambos têm profileId na URL/dados, compara se os profileIds são idênticos
        if (normCand.profileId && pMw.profileId) {
          return normCand.profileId === pMw.profileId;
        }

        // Se uma das partes possui profileId ou sourceKey e a outra não possui perfil correspondente,
        // NUNCA pode usar/fazer fallback para URL ampla do modelo
        if (normCand.profileId || pMw.profileId || candidateSourceKey || productSourceKey) {
          return false;
        }

        // Se nenhuma URL tem profileId (ex: URL genérica de modelo /models/123):
        // Só considera duplicata se o produto existente não tiver um perfil nomeado específico
        // para evitar colidir perfis distintos do mesmo modelo.
        if (pMw.canonicalUrl && normCand.canonicalUrl && pMw.canonicalUrl === normCand.canonicalUrl) {
          if (!pMw.profileName || pMw.profileName === 'Padrão') {
            return true;
          }
        }
      }
    }
  }

  return false;
}

/**
 * Escapa strings para prevenir injeção XSS em interpolações HTML.
 */
export function escapeHtml(str = '') {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>'"]/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  }[c]));
}

/**
 * Valida se uma URL é estritamente do MakerWorld com protocolo HTTPS.
 */
export function isValidMakerWorldUrl(rawUrl = '') {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'https:') return false;
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    return hostname === MAKERWORLD_DOMAIN;
  } catch {
    return false;
  }
}

/**
 * Retorna o href validado para links do MakerWorld ou null se inválido.
 */
export function sanitizeMakerWorldHref(rawUrl = '') {
  if (!isValidMakerWorldUrl(rawUrl)) return null;
  return new URL(rawUrl.trim()).href;
}

/**
 * Identifica quais imagePaths originais foram substituídos/removidos.
 * Garante que apenas os arquivos antigos não presentes na nova lista sejam marcados para exclusão.
 */
export function identifyReplacedImagePaths(originalPaths = [], currentPaths = []) {
  if (!Array.isArray(originalPaths) || originalPaths.length === 0) return [];
  const currentSet = new Set(Array.isArray(currentPaths) ? currentPaths.filter(Boolean) : []);
  const replaced = [];
  for (const p of originalPaths) {
    if (typeof p === 'string' && p.trim() && !currentSet.has(p) && !replaced.includes(p)) {
      replaced.push(p);
    }
  }
  return replaced;
}

/**
 * Identifica se um erro do Firebase Storage representa objeto não encontrado.
 */
export function isStorageNotFoundError(err) {
  if (!err) return false;
  if (err.code === 'storage/object-not-found') return true;
  const msg = String(err.message || '').toLowerCase();
  return msg.includes('object-not-found') || msg.includes('storage/object-not-found');
}

/**
 * Revalidação atômica pré-gravação (preflight) para impedir publicação duplicada,
 * inconsistência de sessão, manifesto inválido ou ausência de imagens.
 */
export function validatePublishPreflight({
  currentUser,
  manifest,
  duplicate,
  localFilesCount = 0,
  isUpdate = false,
  existingImagesCount = 0,
  approvalConfirmed = false,
} = {}) {
  if (!currentUser || !currentUser.uid) {
    return {
      isValid: false,
      error: 'Usuário não autenticado. Faça login no painel administrativo antes de prosseguir.',
    };
  }

  if (!manifest || typeof manifest !== 'object') {
    return {
      isValid: false,
      error: 'Manifesto MakerWorld ausente ou inválido.',
    };
  }

  const manifestValidation = validateMakerWorldManifest(manifest, { requireImages: false });
  if (!manifestValidation.isValid) {
    return {
      isValid: false,
      error: `Manifesto inválido: ${manifestValidation.errors.join('; ')}`,
      manifestValidation,
    };
  }

  // Prevenção de corrida e publicação duplicada
  if (!isUpdate && duplicate) {
    return {
      isValid: false,
      isDuplicateConflict: true,
      error: `Modelo já cadastrado no catálogo (ID: ${duplicate.id || 'existente'}). Atualize o produto existente em vez de publicar uma duplicata.`,
      duplicate,
      manifestValidation,
    };
  }

  if (isUpdate && !duplicate) {
    return {
      isValid: false,
      error: 'Produto existente para atualização não foi localizado.',
      manifestValidation,
    };
  }

  // Validação estrita de imagens
  const totalAvailableImages = isUpdate
    ? localFilesCount + existingImagesCount
    : localFilesCount;

  if (totalAvailableImages < 1) {
    return {
      isValid: false,
      error: 'Ao menos uma foto é obrigatória para publicar ou atualizar o anúncio.',
      manifestValidation,
    };
  }

  if (approvalConfirmed !== true) {
    return {
      isValid: false,
      approvalRequired: true,
      error: 'Aprovação explícita de Dr Mayckon é obrigatória antes de publicar ou atualizar.',
      manifestValidation,
    };
  }

  return {
    isValid: true,
    manifestValidation,
    duplicate,
  };
}
