# Publicador MakerWorld ➔ CRIART 3D (Fluxo OpenClaw & Painel Admin)

Este documento descreve o fluxo de publicação assistida de produtos 3D a partir da plataforma MakerWorld para o catálogo da loja **CRIART 3D**, detalhando o contrato do manifesto JSON, a fórmula matemática de precificação, o tratamento de restrições técnicas e a arquitetura sem bundler.

---

## 1. Visão Geral da Arquitetura

O ecossistema opera de forma desacoplada em módulos puros ES Modules, preservando o modelo estático do frontend sem dependência de bundlers (Webpack/Vite):

1. **`pricing-calculator.js`**: Módulo puro e isomórfico (roda em Node.js e navegadores) que calcula o custo e preço de venda com base nas constantes da loja (`DEFAULT_PRINT_PRICING`) e na fórmula padrão do `app.js`.
2. **`makerworld-product.js`**: Módulo puro responsável pela normalização de links, extração de identificadores (`modelId`, `profileId`), geração de `sourceKey` estável, validação rigorosa de manifestos e montagem do payload compatível com o Firestore.
3. **`admin-makerworld-import.js`**: Interface reativa integrada ao painel administrativo (`/admin`), ativada somente para usuários autenticados (`auth.currentUser`), que recebe o manifesto JSON e os arquivos de imagem locais, processa o upload no Firebase Storage (`products/`) e realiza a escrita no Firestore com verificação preventiva de duplicatas.
4. **`OpenClaw`**: Agente assistente responsável por coletar informações do link fornecido pelo operador, baixar imagens temporariamente no ambiente local e gerar o manifesto formatado.

---

## 2. Contrato do Manifesto JSON (`docs/makerworld-manifest.schema.json`)

O manifesto JSON padroniza todas as informações necessárias para registrar um produto no catálogo da CRIART 3D.

### Exemplo Completo do Manifesto

```json
{
  "nome": "Suporte Articulado para Smartphone",
  "descricao": "Suporte articulado de mesa, compatível com celulares e tablets pequenos. Excelente estabilidade e ângulo ajustável.",
  "sourceUrl": "https://makerworld.com/en/models/123456#profileId-789012",
  "profileId": "789012",
  "profileName": "0.20mm Standard (Bambu X1C)",
  "filamentGrams": 65,
  "printTimeMinutes": 135,
  "material": "PLA",
  "colors": ["Preto", "Cinza Espacial"],
  "dimensions": {
    "x": 80,
    "y": 95,
    "z": 120,
    "unit": "mm"
  },
  "pricingInputs": {
    "precoRolo": 100,
    "pesoRolo": 1000,
    "maqHora": 4.00,
    "energiaHora": 0.20,
    "riscoFalhaPercent": 10,
    "markupPercent": 40
  },
  "images": [
    "capa-suporte.jpg",
    "detalhe-articulacao.jpg",
    "uso-com-celular.jpg"
  ]
}
```

### Especificação dos Campos

| Campo | Tipo | Obrigatório | Descrição |
| :--- | :--- | :---: | :--- |
| `nome` | String | **Sim** | Nome de exibição no catálogo (mínimo 2 caracteres). |
| `descricao` | String | **Sim** | Descrição comercial e técnica da peça (mínimo 3 caracteres). |
| `sourceUrl` | String | **Sim** | URL original no MakerWorld (`makerworld.com`). |
| `profileId` | String / Null | Condicional | ID numérico do perfil. Se ausente na URL, `profileName` é exigido. |
| `profileName` | String | Condicional | Nome legível do perfil de impressão selecionado. |
| `filamentGrams` | Number | **Sim** | Peso em gramas de filamento consumido (maior que zero). |
| `printTimeMinutes` | Number | **Sim** | Tempo de impressão em minutos (maior que zero). |
| `material` | String | Não | Tipo de polímero (default: `"PLA"`). |
| `colors` | Array[String] | Não | Cores recomendadas para a peça. |
| `dimensions` | Object / String | Não | Medidas físicas da peça (ex: `{ x, y, z, unit }`). |
| `preco` | Number | Não | Preço explícito em BRL. Se omitido, é calculado automaticamente. |
| `pricingInputs` | Object | Não | Sobrescrita opcional dos parâmetros padrão de custo. |
| `images` | Array[String] | Não | Nomes das fotos locais preparadas para upload. |

---

## 3. Fórmula de Precificação Compartilhada

A fórmula é rigorosamente idêntica à calculadora interna do `app.js` e implementada em `pricing-calculator.js`:

```javascript
// Constantes padrão
precoRolo = 100        // R$ por rolo de 1 kg
pesoRolo = 1000        // gramas por rolo
quantidade = 1         // quantidade impressa
maqHora = 4.00         // R$/hora de amortização da máquina
energiaHora = 0.20     // R$/hora de consumo elétrico
outros = 0             // outros insumos
riscoFalhaPercent = 10 // % de perda de segurança
markupPercent = 40     // % de margem sobre custo
descontoQuantidade = 0 // % desconto (só aplica se quantidade >= 10)

// Passo a passo:
tempo = printTimeMinutes / 60
material = (precoRolo / pesoRolo) * gramas * quantidade
operacao = (maqHora + energiaHora) * tempo
base = material + operacao + outros
risco = base * (riscoFalhaPercent / 100)
custo = base + risco
bruto = custo * (1 + markupPercent / 100)
descontoAplicado = (quantidade >= 10) ? descontoQuantidade : 0
final = bruto * (1 - descontoAplicado / 100)
precoPorUnidade = final / quantidade
```

**Regras de Validação:**
- É terminantemente proibido publicar ou calcular com `preco <= 0`, `peso <= 0`, `gramas <= 0` ou `tempo <= 0`.
- O cálculo deve produzir sempre um valor final positivo e finito.

---

## 4. Fluxo de Execução com o OpenClaw

### 4.1. Sem Cron Job e Inicialização Sob Demanda
- Não há agendamento automático via cron.
- A primeira execução aguarda um link real fornecido explicitamente pelo operador.
- Nenhum produto fictício ou de teste deve ser criado no banco de produção.

### 4.2. Extração e Tratamento de Bloqueios (Cloudflare / CAPTCHA)
1. O OpenClaw recebe o link do MakerWorld enviado pelo usuário (ex: `https://makerworld.com/en/models/123456#profileId-789012`).
2. Se o MakerWorld bloquear a requisição direta (Cloudflare, CAPTCHA, proteção contra raspagem ou restrição de IP):
   - **Alternativa Obrigatória**: O OpenClaw solicita ao operador que informe os dados que faltarem:
     - Gramas de filamento informadas pelo slicer/perfil.
     - Tempo de impressão total (horas/minutos).
     - Nome ou ID do perfil de impressão.
   - O operador pode baixar as fotos do modelo manualmente pelo navegador e colocá-las em uma pasta local.
3. **Tratamento de Imagens Temporárias**:
   - Imagens são mantidas localmente em pasta temporária pelo OpenClaw.
   - **Regra de Segurança Estrita**: URLs externas do MakerWorld ou Bambu Lab **nunca** são gravadas no array `imageUrls` do catálogo. Todas as fotos do produto final devem vir obrigatoriamente de uploads locais para o Firebase Storage (`products/`).

### 4.3. Autenticação e Publicação
- A autenticação é realizada unicamente através da sessão Admin existente no navegador (`auth.currentUser`).
- Nenhuma chave privada ou credencial de serviço é embutida em scripts públicos.
- O operador abre o painel `/admin`, carrega o arquivo `.json` gerado pelo OpenClaw (ou cola o JSON na área de texto) e seleciona as imagens do disco.

---

## 5. Prevenção de Duplicatas e Atualização Segura

Para garantir a integridade do catálogo:

1. **`sourceKey` Determinístico**:
   - Formato: `makerworld:<modelId>:<profileId|slug>`
   - Exemplo: `makerworld:123456:789012` ou `makerworld:123456:0-20mm-standard`
2. **Consulta em Tempo Real**:
   - Antes de habilitar o botão de publicação, o sistema consulta a coleção `products` do Firestore procurando por correspondência de `sourceKey`, `canonicalUrl` ou `sourceUrl`.
3. **Bloqueio e Atualização Assistida**:
   - Se uma duplicata for detectada:
     - O botão de novo cadastro é desativado.
     - É exibido aviso em destaque com o nome, ID e preço do produto existente.
     - São disponibilizados os botões **"Atualizar produto existente"** e **"Limpar formulário"**.
4. **Segurança na Atualização**:
   - O campo `createdAt` original é estritamente preservado.
   - Apenas `updatedAt` é atualizado via `serverTimestamp()`.
   - Se o operador **não** selecionar novas imagens no formulário de atualização, as fotos cadastradas anteriormente (`imageUrls` e `imagePaths`) são mantidas intactas sem exclusão no Storage.
   - Se o operador selecionar novos arquivos, as novas fotos são enviadas e a primeira se torna a nova foto principal.

---

## 6. Checklist de Validação para Publicação

O sistema rejeita a publicação se qualquer um dos seguintes critérios não for atendido:

- [x] Nome do produto preenchido e com mais de 2 caracteres.
- [x] Descrição detalhada preenchida.
- [x] URL do MakerWorld válida do domínio `makerworld.com`.
- [x] Perfil de impressão identificável (`profileId` ou `profileName`).
- [x] Gramas de filamento maiores que zero.
- [x] Tempo de impressão em minutos maior que zero.
- [x] Preço final calculado maior que zero.
- [x] Ao menos uma imagem local válida enviada ao Storage.
- [x] Campo `ativo` definido como `true`.
