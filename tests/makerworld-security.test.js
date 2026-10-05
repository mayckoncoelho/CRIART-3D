import test from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeHtml,
  isValidMakerWorldUrl,
  sanitizeMakerWorldHref,
  identifyReplacedImagePaths,
  isStorageNotFoundError,
  validatePublishPreflight,
  normalizeMakerWorldUrl,
} from '../makerworld-product.js';

test('escapeHtml neutraliza completamente caracteres de injeção XSS', () => {
  // Tags script e injeções comuns
  assert.equal(
    escapeHtml("<script>alert('xss')</script>"),
    '&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;'
  );

  // Quebra de atributos com aspas duplas
  assert.equal(
    escapeHtml('"><img src=x onerror=alert(1)>'),
    '&quot;&gt;&lt;img src=x onerror=alert(1)&gt;'
  );

  // Quebra de atributos com aspas simples e eventos
  assert.equal(
    escapeHtml("' onfocus='fetch(\"/evil\")"),
    '&#39; onfocus=&#39;fetch(&quot;/evil&quot;)'
  );

  // Entidades HTML ampersand
  assert.equal(
    escapeHtml('Peça & Arte <3D>'),
    'Peça &amp; Arte &lt;3D&gt;'
  );

  // Valores numéricos, nulos e indefinidos
  assert.equal(escapeHtml(12345), '12345');
  assert.equal(escapeHtml(0), '0');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(''), '');
});

test('isValidMakerWorldUrl e sanitizeMakerWorldHref aceitam apenas HTTPS de makerworld.com', () => {
  // URLs HTTPS válidas do MakerWorld
  const valid1 = 'https://makerworld.com/en/models/123456#profileId-789012';
  const valid2 = 'https://makerworld.com/en/models/654321?profileId=998877';
  const valid3 = 'https://makerworld.com/models/112233';
  const valid4 = 'https://www.makerworld.com/en/models/445566';

  assert.equal(isValidMakerWorldUrl(valid1), true);
  assert.equal(sanitizeMakerWorldHref(valid1), valid1);

  assert.equal(isValidMakerWorldUrl(valid2), true);
  assert.equal(sanitizeMakerWorldHref(valid2), valid2);

  assert.equal(isValidMakerWorldUrl(valid3), true);
  assert.equal(sanitizeMakerWorldHref(valid3), valid3);

  assert.equal(isValidMakerWorldUrl(valid4), true);
  assert.equal(sanitizeMakerWorldHref(valid4), valid4);

  // Rejeição estrita de HTTP não seguro
  assert.equal(isValidMakerWorldUrl('http://makerworld.com/en/models/123456'), false);
  assert.equal(sanitizeMakerWorldHref('http://makerworld.com/en/models/123456'), null);

  // Rejeição estrita de esquemas perigosos (javascript:, data:, vbscript:)
  assert.equal(isValidMakerWorldUrl('javascript:alert(document.cookie)'), false);
  assert.equal(sanitizeMakerWorldHref('javascript:alert(document.cookie)'), null);

  assert.equal(isValidMakerWorldUrl('data:text/html,<script>alert(1)</script>'), false);
  assert.equal(sanitizeMakerWorldHref('data:text/html,<script>alert(1)</script>'), null);

  // Rejeição de domínios maliciosos ou similares
  assert.equal(isValidMakerWorldUrl('https://makerworld.com.evil.com/models/123'), false);
  assert.equal(sanitizeMakerWorldHref('https://makerworld.com.evil.com/models/123'), null);

  assert.equal(isValidMakerWorldUrl('https://evilmakerworld.com/models/123'), false);
  assert.equal(sanitizeMakerWorldHref('https://evilmakerworld.com/models/123'), null);

  assert.equal(isValidMakerWorldUrl('https://thingiverse.com/thing:12345'), false);
  assert.equal(sanitizeMakerWorldHref('https://thingiverse.com/thing:12345'), null);

  // Entradas nulas ou malformadas
  assert.equal(isValidMakerWorldUrl(''), false);
  assert.equal(isValidMakerWorldUrl(null), false);
  assert.equal(isValidMakerWorldUrl(undefined), false);
  assert.equal(isValidMakerWorldUrl('not-a-url'), false);
});

test('normalizeMakerWorldUrl rejeita protocolos não-HTTPS', () => {
  const resHttp = normalizeMakerWorldUrl('http://makerworld.com/en/models/123456');
  assert.equal(resHttp.isValid, false);
  assert.match(resHttp.error, /https/);

  const resJs = normalizeMakerWorldUrl('javascript:alert(1)');
  assert.equal(resJs.isValid, false);
});

test('identifyReplacedImagePaths identifica exclusivamente imagens substituídas/removidas', () => {
  const original = ['products/p1.jpg', 'products/p2.jpg', 'products/p3.jpg'];

  // Substituição total por nova foto
  const replacedAll = identifyReplacedImagePaths(original, ['products/p4_novo.jpg']);
  assert.deepEqual(replacedAll, ['products/p1.jpg', 'products/p2.jpg', 'products/p3.jpg']);

  // Manutenção de subset (p2 mantida, p1 e p3 removidas)
  const replacedPartial = identifyReplacedImagePaths(original, ['products/p2.jpg', 'products/p5_novo.jpg']);
  assert.deepEqual(replacedPartial, ['products/p1.jpg', 'products/p3.jpg']);

  // Nenhuma foto alterada
  const replacedNone = identifyReplacedImagePaths(original, ['products/p1.jpg', 'products/p2.jpg', 'products/p3.jpg']);
  assert.deepEqual(replacedNone, []);

  // Entradas vazias ou inválidas
  assert.deepEqual(identifyReplacedImagePaths([], ['products/p1.jpg']), []);
  assert.deepEqual(identifyReplacedImagePaths(null, null), []);
  assert.deepEqual(identifyReplacedImagePaths([''], []), []);
});

test('isStorageNotFoundError identifica corretamente erros de objeto não encontrado', () => {
  // Código padrão do Firebase Storage
  assert.equal(isStorageNotFoundError({ code: 'storage/object-not-found' }), true);

  // Mensagem contendo object-not-found
  assert.equal(isStorageNotFoundError({ message: 'Firebase Storage: Object does not exist (storage/object-not-found).' }), true);
  assert.equal(isStorageNotFoundError(new Error('storage/object-not-found')), true);

  // Outros erros NÃO devem ser tolerados como not-found
  assert.equal(isStorageNotFoundError({ code: 'storage/unauthorized' }), false);
  assert.equal(isStorageNotFoundError({ code: 'storage/retry-limit-exceeded' }), false);
  assert.equal(isStorageNotFoundError(new Error('Network error')), false);
  assert.equal(isStorageNotFoundError(null), false);
  assert.equal(isStorageNotFoundError(undefined), false);
});

test('validatePublishPreflight impede corrida, publicação duplicada e sessão inválida', () => {
  const validManifest = {
    nome: 'Organizador Criart',
    descricao: 'Organizador moderno para escritório.',
    sourceUrl: 'https://makerworld.com/en/models/123456#profileId-789',
    profileName: '0.20mm Standard',
    filamentGrams: 50,
    printTimeMinutes: 120,
    material: 'PLA',
  };

  const user = { uid: 'admin_123', email: 'admin@criart3d.com' };

  // 1. Falha quando usuário não está autenticado
  const resNoAuth = validatePublishPreflight({
    currentUser: null,
    manifest: validManifest,
    localFilesCount: 1,
    isUpdate: false,
  });
  assert.equal(resNoAuth.isValid, false);
  assert.match(resNoAuth.error, /autenticado/i);

  // 2. Falha quando manifesto é inválido
  const resBadManifest = validatePublishPreflight({
    currentUser: user,
    manifest: { ...validManifest, nome: '' },
    localFilesCount: 1,
    isUpdate: false,
  });
  assert.equal(resBadManifest.isValid, false);
  assert.match(resBadManifest.error, /Manifesto inválido/i);

  // 3. Corrida / publicação nova duplicada: isUpdate = false mas duplicata já existe no Firestore
  const duplicateProduct = { id: 'prod_99', sourceKey: 'makerworld:123456:789' };
  const resDuplicateRace = validatePublishPreflight({
    currentUser: user,
    manifest: validManifest,
    duplicate: duplicateProduct,
    localFilesCount: 1,
    isUpdate: false,
  });
  assert.equal(resDuplicateRace.isValid, false);
  assert.equal(resDuplicateRace.isDuplicateConflict, true);
  assert.match(resDuplicateRace.error, /já cadastrado/i);

  // 4. Tentativa de atualização sem produto existente
  const resMissingUpdateTarget = validatePublishPreflight({
    currentUser: user,
    manifest: validManifest,
    duplicate: null,
    localFilesCount: 1,
    isUpdate: true,
  });
  assert.equal(resMissingUpdateTarget.isValid, false);
  assert.match(resMissingUpdateTarget.error, /não foi localizado/i);

  // 5. Publicação sem fotos locais
  const resNoImagesNew = validatePublishPreflight({
    currentUser: user,
    manifest: validManifest,
    duplicate: null,
    localFilesCount: 0,
    isUpdate: false,
  });
  assert.equal(resNoImagesNew.isValid, false);
  assert.match(resNoImagesNew.error, /foto é obrigatória/i);

  // 6. Atualização sem fotos novas E sem fotos existentes prévias
  const resNoImagesUpdate = validatePublishPreflight({
    currentUser: user,
    manifest: validManifest,
    duplicate: duplicateProduct,
    localFilesCount: 0,
    existingImagesCount: 0,
    isUpdate: true,
  });
  assert.equal(resNoImagesUpdate.isValid, false);
  assert.match(resNoImagesUpdate.error, /foto é obrigatória/i);

  // 7. Sucesso em nova publicação válida
  const resSuccessNew = validatePublishPreflight({
    currentUser: user,
    manifest: validManifest,
    duplicate: null,
    localFilesCount: 2,
    isUpdate: false,
  });
  assert.equal(resSuccessNew.isValid, true);

  // 8. Sucesso em atualização válida preservando fotos existentes
  const resSuccessUpdate = validatePublishPreflight({
    currentUser: user,
    manifest: validManifest,
    duplicate: duplicateProduct,
    localFilesCount: 0,
    existingImagesCount: 3,
    isUpdate: true,
  });
  assert.equal(resSuccessUpdate.isValid, true);
});

test('makerworld-manifest.schema.json aceita apenas URLs HTTPS e rejeita HTTP', async () => {
  const { readFile } = await import('node:fs/promises');
  const schemaPath = new URL('../docs/makerworld-manifest.schema.json', import.meta.url);
  const schemaContent = JSON.parse(await readFile(schemaPath, 'utf-8'));

  const sourceUrlPattern = new RegExp(schemaContent.properties.sourceUrl.pattern);

  // URLs HTTPS válidas devem passar
  assert.equal(sourceUrlPattern.test('https://makerworld.com/en/models/123456#profileId-789012'), true);
  assert.equal(sourceUrlPattern.test('https://makerworld.com/models/123456'), true);
  assert.equal(sourceUrlPattern.test('https://www.makerworld.com/en/models/123456'), true);

  // URLs HTTP, sem HTTPS ou outros esquemas devem ser estritamente rejeitados
  assert.equal(sourceUrlPattern.test('http://makerworld.com/en/models/123456'), false);
  assert.equal(sourceUrlPattern.test('http://www.makerworld.com/models/123'), false);
  assert.equal(sourceUrlPattern.test('ftp://makerworld.com/models/123'), false);
  assert.equal(sourceUrlPattern.test('javascript:alert(1)'), false);
});

