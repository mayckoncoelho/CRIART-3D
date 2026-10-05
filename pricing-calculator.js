/**
 * CRIART 3D - Pricing Calculator (Módulo puro para navegador e Node.js)
 * Implementação da fórmula de precificação de impressão 3D idêntica ao app.js.
 */

export const DEFAULT_PRINT_PRICING = Object.freeze({
  precoRolo: 100,
  pesoRolo: 1000,
  quantidade: 1,
  maqHora: 4,
  energiaHora: 0.20,
  outros: 0,
  riscoFalhaPercent: 10,
  markupPercent: 40,
  descontoQuantidadePercent: 0,
});

/**
 * Extrai o tempo em horas a partir de várias combinações possíveis de campos:
 * - tempo (horas decimais)
 * - tempoEmHoras (horas decimais)
 * - horas e minutos
 * - printTimeMinutes ou tempoMinutos (minutos totais)
 */
export function extractTempoHoras(inputs = {}) {
  if (typeof inputs.tempo === 'number' && Number.isFinite(inputs.tempo) && inputs.tempo > 0) {
    return inputs.tempo;
  }
  if (typeof inputs.tempoEmHoras === 'number' && Number.isFinite(inputs.tempoEmHoras) && inputs.tempoEmHoras > 0) {
    return inputs.tempoEmHoras;
  }

  const horas = Number(inputs.horas) || 0;
  const minutos = Number(
    inputs.minutos ??
    inputs.printTimeMinutes ??
    inputs.tempoMinutos ??
    0
  ) || 0;

  return horas + (minutos / 60);
}

/**
 * Valida os dados de entrada para o cálculo de preço.
 * Retorna { valid: boolean, errors: string[] }
 */
export function validatePricingInputs(inputs = {}) {
  const errors = [];

  const preco = Number(inputs.precoRolo ?? inputs.preco ?? DEFAULT_PRINT_PRICING.precoRolo);
  const peso = Number(inputs.pesoRolo ?? inputs.peso ?? DEFAULT_PRINT_PRICING.pesoRolo);
  const gramas = Number(inputs.gramas ?? inputs.filamentGrams ?? 0);
  const tempo = extractTempoHoras(inputs);
  const quantidade = Number(inputs.quantidade ?? inputs.qtd ?? DEFAULT_PRINT_PRICING.quantidade);

  if (!Number.isFinite(preco) || preco <= 0) {
    errors.push('Preço do rolo deve ser maior que zero.');
  }
  if (!Number.isFinite(peso) || peso <= 0) {
    errors.push('Peso do rolo deve ser maior que zero.');
  }
  if (!Number.isFinite(gramas) || gramas <= 0) {
    errors.push('Gramas de filamento devem ser maiores que zero.');
  }
  if (!Number.isFinite(tempo) || tempo <= 0) {
    errors.push('Tempo de impressão deve ser maior que zero.');
  }
  if (!Number.isFinite(quantidade) || quantidade < 1) {
    errors.push('Quantidade deve ser no mínimo 1.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Executa o cálculo de preço com a mesma fórmula matemática de app.js:
 * 
 * material = (preco / peso) * gramas * q
 * operacao = (maqHora + energiaHora) * tempo
 * base = material + operacao + outros
 * risco = base * (falha / 100)
 * custo = base + risco
 * bruto = custo * (1 + markup / 100)
 * desc = q >= 10 ? desconto : 0
 * final = bruto * (1 - desc / 100)
 */
export function calculatePrintPrice(inputs = {}) {
  const preco = Number(inputs.precoRolo ?? inputs.preco ?? DEFAULT_PRINT_PRICING.precoRolo);
  const peso = Number(inputs.pesoRolo ?? inputs.peso ?? DEFAULT_PRINT_PRICING.pesoRolo);
  const gramas = Number(inputs.gramas ?? inputs.filamentGrams ?? 0);
  const tempo = extractTempoHoras(inputs);
  const q = Math.max(1, Number(inputs.quantidade ?? inputs.qtd ?? DEFAULT_PRINT_PRICING.quantidade) || 1);

  const validation = validatePricingInputs({
    precoRolo: preco,
    pesoRolo: peso,
    gramas,
    tempo,
    quantidade: q,
  });

  if (!validation.valid) {
    throw new Error(`Não foi possível calcular o preço: ${validation.errors.join(' ')}`);
  }

  const maqHora = Number(inputs.maqHora ?? DEFAULT_PRINT_PRICING.maqHora) || 0;
  const energiaHora = Number(inputs.energiaHora ?? inputs.energia ?? DEFAULT_PRINT_PRICING.energiaHora) || 0;
  const outros = Number(inputs.outros ?? DEFAULT_PRINT_PRICING.outros) || 0;
  const riscoFalhaPercent = Number(inputs.riscoFalhaPercent ?? inputs.falha ?? DEFAULT_PRINT_PRICING.riscoFalhaPercent) || 0;
  const markupPercent = Number(inputs.markupPercent ?? inputs.markup ?? DEFAULT_PRINT_PRICING.markupPercent) || 0;
  const descontoQuantidadePercent = Number(
    inputs.descontoQuantidadePercent ??
    inputs.desconto ??
    DEFAULT_PRINT_PRICING.descontoQuantidadePercent
  ) || 0;

  const material = (preco / peso) * gramas * q;
  const operacao = (maqHora + energiaHora) * tempo;
  const base = material + operacao + outros;
  const risco = base * (riscoFalhaPercent / 100);
  const custo = base + risco;
  const bruto = custo * (1 + markupPercent / 100);
  const desc = q >= 10 ? descontoQuantidadePercent : 0;
  const final = bruto * (1 - desc / 100);

  if (!Number.isFinite(final) || final <= 0) {
    throw new Error('Preço final calculado inválido ou menor/igual a zero.');
  }

  const precoPorUnidade = final / q;

  return {
    material,
    operacao,
    base,
    risco,
    custo,
    markup: markupPercent,
    markupPercent,
    bruto,
    desconto: desc,
    descontoAplicado: desc,
    final,
    precoPorUnidade,
    quantidade: q,
    tempoHoras: tempo,
    inputs: {
      precoRolo: preco,
      pesoRolo: peso,
      gramas,
      quantidade: q,
      tempoHoras: tempo,
      maqHora,
      energiaHora,
      outros,
      riscoFalhaPercent,
      markupPercent,
      descontoQuantidadePercent,
    },
  };
}
