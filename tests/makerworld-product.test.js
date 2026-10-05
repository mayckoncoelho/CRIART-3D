import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeMakerWorldUrl,
  buildSourceKey,
  validateMakerWorldManifest,
  buildMakerWorldProductPayload,
  isDuplicateMakerWorldProduct,
} from '../makerworld-product.js';

test('normalizeMakerWorldUrl normaliza links e extrai modelId e profileId corretamente', () => {
  // Com hash #profileId-789012
  const r1 = normalizeMakerWorldUrl('https://makerworld.com/en/models/123456#profileId-789012');
  assert.equal(r1.isValid, true);
  assert.equal(r1.modelId, '123456');
  assert.equal(r1.profileId, '789012');
  assert.equal(r1.canonicalUrl, 'https://makerworld.com/en/models/123456#profileId-789012');

  // Com query param ?profileId=789012
  const r2 = normalizeMakerWorldUrl('https://makerworld.com/en/models/654321?profileId=998877');
  assert.equal(r2.isValid, true);
  assert.equal(r2.modelId, '654321');
  assert.equal(r2.profileId, '998877');
  assert.equal(r2.canonicalUrl, 'https://makerworld.com/en/models/654321#profileId-998877');

  // Com slug no modelo
  const r3 = normalizeMakerWorldUrl('https://makerworld.com/en/models/112233-dragao-articulado#profileId-445566');
  assert.equal(r3.isValid, true);
  assert.equal(r3.modelId, '112233');
  assert.equal(r3.profileId, '445566');
  assert.equal(r3.canonicalUrl, 'https://makerworld.com/en/models/112233#profileId-445566');

  // Sem profileId
  const r4 = normalizeMakerWorldUrl('https://makerworld.com/en/models/999888');
  assert.equal(r4.isValid, true);
  assert.equal(r4.modelId, '999888');
  assert.equal(r4.profileId, null);
  assert.equal(r4.canonicalUrl, 'https://makerworld.com/en/models/999888');

  // Domínio não MakerWorld deve ser rejeitado
  const rInvalido = normalizeMakerWorldUrl('https://thingiverse.com/thing:123456');
  assert.equal(rInvalido.isValid, false);
  assert.match(rInvalido.error, /makerworld\.com/);

  // String inválida
  const rVazio = normalizeMakerWorldUrl('');
  assert.equal(rVazio.isValid, false);
});

test('buildSourceKey gera chave estável e determinística por modelo e perfil', () => {
  const k1 = buildSourceKey({ modelId: '123456', profileId: '789012' });
  const k2 = buildSourceKey({ modelId: '123456', profileId: '789012' });
  assert.equal(k1, 'makerworld:123456:789012');
  assert.equal(k1, k2);

  // Chave com profileName slugificado
  const k3 = buildSourceKey({ modelId: '123456', profileName: '0.20mm Standard (Bambu)' });
  assert.equal(k3, 'makerworld:123456:0-20mm-standard-bambu');

  // Perfis diferentes para o mesmo modelo devem produzir chaves diferentes
  const k4 = buildSourceKey({ modelId: '123456', profileId: '111111' });
  assert.notEqual(k1, k4);

  // Extração automática via sourceUrl
  const k5 = buildSourceKey({ sourceUrl: 'https://makerworld.com/en/models/888999#profileId-555' });
  assert.equal(k5, 'makerworld:888999:555');

  // Erro quando modelId não pode ser determinado
  assert.throws(() => buildSourceKey({}), /modelId ausente/);
});

test('validateMakerWorldManifest valida requisitos estritos de publicação', () => {
  const validManifest = {
    nome: 'Suporte Articulado para Smartphone',
    descricao: 'Suporte ajustável e articulado para smartphones de diversos tamanhos.',
    sourceUrl: 'https://makerworld.com/en/models/123456#profileId-789012',
    profileName: '0.20mm Standard',
    filamentGrams: 50,
    printTimeMinutes: 120,
    material: 'PLA',
  };

  const resValido = validateMakerWorldManifest(validManifest);
  assert.equal(resValido.isValid, true);
  assert.equal(resValido.errors.length, 0);
  assert.equal(resValido.normalized.nome, 'Suporte Articulado para Smartphone');
  assert.equal(resValido.normalized.sourceKey, 'makerworld:123456:789012');

  // Nome ausente
  const resSemNome = validateMakerWorldManifest({ ...validManifest, nome: '' });
  assert.equal(resSemNome.isValid, false);
  assert.ok(resSemNome.errors.some(e => e.includes('Nome')));

  // Descrição ausente
  const resSemDesc = validateMakerWorldManifest({ ...validManifest, descricao: '' });
  assert.equal(resSemDesc.isValid, false);
  assert.ok(resSemDesc.errors.some(e => e.includes('Descrição')));

  // URL inválida
  const resUrlInvalida = validateMakerWorldManifest({ ...validManifest, sourceUrl: 'https://google.com' });
  assert.equal(resUrlInvalida.isValid, false);
  assert.ok(resUrlInvalida.errors.some(e => e.includes('URL')));

  // Gramas zero ou negativo
  const resGramasZero = validateMakerWorldManifest({ ...validManifest, filamentGrams: 0 });
  assert.equal(resGramasZero.isValid, false);
  assert.ok(resGramasZero.errors.some(e => e.includes('Gramas')));

  // Tempo zero ou negativo
  const resTempoZero = validateMakerWorldManifest({ ...validManifest, printTimeMinutes: 0 });
  assert.equal(resTempoZero.isValid, false);
  assert.ok(resTempoZero.errors.some(e => e.includes('Tempo')));

  // Exigência de imagens locais quando requireImages = true
  const resSemImagens = validateMakerWorldManifest(validManifest, { requireImages: true, imagesCount: 0 });
  assert.equal(resSemImagens.isValid, false);
  assert.ok(resSemImagens.errors.some(e => e.includes('imagem')));
});

test('buildMakerWorldProductPayload monta payload compatível e preserva segurança', () => {
  const manifest = {
    nome: 'Organizador de Cabos',
    descricao: 'Organizador de cabos modular para mesas e bancadas de trabalho.',
    sourceUrl: 'https://makerworld.com/en/models/234567#profileId-890123',
    profileName: 'Perfil Rápido 0.28mm',
    filamentGrams: 60,
    printTimeMinutes: 90,
    material: 'PETG',
    colors: ['Preto', 'Laranja'],
  };

  const imageUrls = [
    'https://firebasestorage.googleapis.com/v0/b/bucket/o/products%2Ffoto1.jpg?alt=media',
    'https://firebasestorage.googleapis.com/v0/b/bucket/o/products%2Ffoto2.jpg?alt=media',
  ];
  const imagePaths = ['products/foto1.jpg', 'products/foto2.jpg'];

  const payload = buildMakerWorldProductPayload(manifest, { imageUrls, imagePaths });

  assert.equal(payload.nome, 'Organizador de Cabos');
  assert.equal(payload.ativo, true);
  assert.equal(payload.sourceKey, 'makerworld:234567:890123');
  assert.equal(payload.imageUrls[0], imageUrls[0]);
  assert.equal(payload.imageUrls.length, 2);
  assert.ok(payload.preco > 0);

  // Validação do agrupamento makerworld
  assert.ok(payload.makerworld);
  assert.equal(payload.makerworld.modelId, '234567');
  assert.equal(payload.makerworld.profileId, '890123');
  assert.equal(payload.makerworld.material, 'PETG');
  assert.equal(payload.makerworld.filamentGrams, 60);
  assert.equal(payload.makerworld.printTimeMinutes, 90);
  assert.deepEqual(payload.makerworld.colors, ['Preto', 'Laranja']);
  assert.ok(payload.makerworld.pricingResult.custo > 0);
  assert.ok(payload.makerworld.pricingResult.final > 0);
  assert.equal(payload.makerworld.version, '1.0');
});

test('buildMakerWorldProductPayload rejeita URLs externas do MakerWorld em imageUrls', () => {
  const manifest = {
    nome: 'Peça Teste',
    descricao: 'Descrição de peça para teste de segurança de imagem.',
    sourceUrl: 'https://makerworld.com/en/models/234567#profileId-890123',
    profileName: 'Padrão',
    filamentGrams: 30,
    printTimeMinutes: 45,
  };

  assert.throws(() => {
    buildMakerWorldProductPayload(manifest, {
      imageUrls: ['https://makerworld.bambulab.com/static/image.jpg'],
    });
  }, /URLs externas do MakerWorld não são permitidas como imageUrls/);
});

test('buildMakerWorldProductPayload preserva createdAt e imagens na atualização', () => {
  const manifest = {
    nome: 'Peça Atualizada',
    descricao: 'Descrição nova para a peça atualizada no catálogo.',
    sourceUrl: 'https://makerworld.com/en/models/234567#profileId-890123',
    profileName: 'Perfil V2',
    filamentGrams: 35,
    printTimeMinutes: 50,
  };

  const existingProduct = {
    id: 'prod-123',
    nome: 'Peça Antiga',
    createdAt: { seconds: 1700000000, nanoseconds: 0 },
    imageUrls: ['https://firebasestorage.googleapis.com/v0/b/bucket/o/products%2Ffoto_antiga.jpg'],
    imagePaths: ['products/foto_antiga.jpg'],
  };

  // Sem novas imagens: deve manter as antigas e preservar createdAt
  const payloadAtualizacao = buildMakerWorldProductPayload(manifest, {
    existingProduct,
    imageUrls: [],
    imagePaths: [],
  });

  assert.equal(payloadAtualizacao.imageUrls[0], 'https://firebasestorage.googleapis.com/v0/b/bucket/o/products%2Ffoto_antiga.jpg');
  assert.equal(payloadAtualizacao.imagePaths[0], 'products/foto_antiga.jpg');
  assert.deepEqual(payloadAtualizacao.createdAt, existingProduct.createdAt);
});

test('isDuplicateMakerWorldProduct identifica duplicatas por sourceKey ou URL', () => {
  const existingProduct = {
    id: 'p1',
    sourceKey: 'makerworld:123456:789012',
    makerworld: {
      sourceUrl: 'https://makerworld.com/en/models/123456#profileId-789012',
      canonicalUrl: 'https://makerworld.com/en/models/123456#profileId-789012',
      modelId: '123456',
      profileId: '789012',
    },
  };

  // Duplicata por sourceKey exato
  assert.equal(
    isDuplicateMakerWorldProduct(existingProduct, 'makerworld:123456:789012', ''),
    true
  );

  // Duplicata por URL
  assert.equal(
    isDuplicateMakerWorldProduct(existingProduct, '', 'https://makerworld.com/en/models/123456#profileId-789012'),
    true
  );

  // Produto diferente
  assert.equal(
    isDuplicateMakerWorldProduct(existingProduct, 'makerworld:999999:000000', 'https://makerworld.com/en/models/999999'),
    false
  );
});

test('buildMakerWorldProductPayload aceita preco como string numérica e valida formato finito e positivo', () => {
  const manifest = {
    nome: 'Peça com Preço String',
    descricao: 'Teste de aceitação de preço fornecido como string numérica.',
    sourceUrl: 'https://makerworld.com/en/models/234567#profileId-890123',
    profileName: 'Perfil V2',
    filamentGrams: 30,
    printTimeMinutes: 45,
    preco: '49.90',
  };

  const payload = buildMakerWorldProductPayload(manifest, {
    imageUrls: ['https://firebasestorage.googleapis.com/v0/b/bucket/o/products%2Fteste.jpg'],
    imagePaths: ['products/teste.jpg'],
  });

  assert.equal(typeof payload.preco, 'number');
  assert.equal(payload.preco, 49.90);

  // Preço string inválido ou não positivo deve falhar
  assert.throws(() => {
    buildMakerWorldProductPayload({ ...manifest, preco: 'invalido' }, {
      imageUrls: ['https://firebasestorage.googleapis.com/v0/b/bucket/o/products%2Fteste.jpg'],
    });
  }, /número finito maior que zero/);

  assert.throws(() => {
    buildMakerWorldProductPayload({ ...manifest, preco: '-15.00' }, {
      imageUrls: ['https://firebasestorage.googleapis.com/v0/b/bucket/o/products%2Fteste.jpg'],
    });
  }, /número finito maior que zero/);
});

test('isDuplicateMakerWorldProduct diferencia perfis distintos do mesmo modelo e previne colisões', () => {
  const produtoPerfilA = {
    id: 'prod_a',
    sourceKey: 'makerworld:123456:111111',
    makerworld: {
      sourceUrl: 'https://makerworld.com/en/models/123456#profileId-111111',
      canonicalUrl: 'https://makerworld.com/en/models/123456#profileId-111111',
      modelId: '123456',
      profileId: '111111',
      profileName: '0.20mm Standard',
    },
  };

  // 1. Mesmo modelo com profileId diferente NÃO deve colidir
  assert.equal(
    isDuplicateMakerWorldProduct(produtoPerfilA, 'makerworld:123456:222222', 'https://makerworld.com/en/models/123456#profileId-222222'),
    false
  );

  // 2. Mesmo modelo com profileId idêntico DEVE colidir (duplicata identificada)
  assert.equal(
    isDuplicateMakerWorldProduct(produtoPerfilA, 'makerworld:123456:111111', 'https://makerworld.com/en/models/123456#profileId-111111'),
    true
  );

  // 3. Dois perfis com nomes descritivos distintos (sem profileId na URL) para o mesmo modelo
  const produtoPerfilNome1 = {
    id: 'prod_b1',
    sourceKey: 'makerworld:654321:0-20mm-padrao',
    makerworld: {
      sourceUrl: 'https://makerworld.com/en/models/654321',
      canonicalUrl: 'https://makerworld.com/en/models/654321',
      modelId: '654321',
      profileId: null,
      profileName: '0.20mm Padrão',
    },
  };

  // Candidato com profileName diferente do mesmo modelo (URL genérica de modelo não pode colidir)
  assert.equal(
    isDuplicateMakerWorldProduct(produtoPerfilNome1, 'makerworld:654321:0-08mm-extra-fino', 'https://makerworld.com/en/models/654321'),
    false
  );

  // Candidato com mesmo sourceKey e URL genérica colide
  assert.equal(
    isDuplicateMakerWorldProduct(produtoPerfilNome1, 'makerworld:654321:0-20mm-padrao', 'https://makerworld.com/en/models/654321'),
    true
  );

  // 4. Bloqueio estrito de fallback para URL ampla quando houver sourceKey ou profileId
  const produtoAmploSemPerfil = {
    id: 'prod_amplo',
    makerworld: {
      sourceUrl: 'https://makerworld.com/en/models/123456',
      canonicalUrl: 'https://makerworld.com/en/models/123456',
      modelId: '123456',
      profileId: null,
      profileName: 'Padrão',
    },
  };

  // Se o candidato tem sourceKey/profileId específico, NÃO pode fazer fallback para a URL ampla existente
  assert.equal(
    isDuplicateMakerWorldProduct(produtoAmploSemPerfil, 'makerworld:123456:789012', 'https://makerworld.com/en/models/123456'),
    false
  );

  // Se o produto existente tem sourceKey/profileId específico, candidato com URL ampla NÃO pode colidir
  assert.equal(
    isDuplicateMakerWorldProduct(produtoPerfilA, '', 'https://makerworld.com/en/models/123456'),
    false
  );
});

