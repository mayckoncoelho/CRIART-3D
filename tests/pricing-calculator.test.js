import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PRINT_PRICING,
  extractTempoHoras,
  validatePricingInputs,
  calculatePrintPrice,
} from '../pricing-calculator.js';

test('DEFAULT_PRINT_PRICING possui todos os valores padrões exigidos', () => {
  assert.equal(DEFAULT_PRINT_PRICING.precoRolo, 100);
  assert.equal(DEFAULT_PRINT_PRICING.pesoRolo, 1000);
  assert.equal(DEFAULT_PRINT_PRICING.quantidade, 1);
  assert.equal(DEFAULT_PRINT_PRICING.maqHora, 4);
  assert.equal(DEFAULT_PRINT_PRICING.energiaHora, 0.20);
  assert.equal(DEFAULT_PRINT_PRICING.outros, 0);
  assert.equal(DEFAULT_PRINT_PRICING.riscoFalhaPercent, 10);
  assert.equal(DEFAULT_PRINT_PRICING.markupPercent, 40);
  assert.equal(DEFAULT_PRINT_PRICING.descontoQuantidadePercent, 0);
});

test('Paridade da fórmula: calcula exatamente igual à matemática de app.js', () => {
  // Valores idênticos aos inputs de teste
  const preco = 100;
  const peso = 1000;
  const g = 50;
  const q = 1;
  const horas = 2;
  const minutos = 30;
  const tempo = horas + minutos / 60; // 2.5 horas
  const maqHora = 4;
  const energia = 0.20;
  const outros = 0;
  const falha = 10;
  const markup = 40;
  const desconto = 0;

  // Cálculo manual da fórmula do app.js:
  const expMaterial = (preco / peso) * g * q; // 5.00
  const expOperacao = (maqHora + energia) * tempo; // 10.50
  const expBase = expMaterial + expOperacao + outros; // 15.50
  const expRisco = expBase * (falha / 100); // 1.55
  const expCusto = expBase + expRisco; // 17.05
  const expBruto = expCusto * (1 + markup / 100); // 23.87
  const expDesc = q >= 10 ? desconto : 0; // 0
  const expFinal = expBruto * (1 - expDesc / 100); // 23.87

  const res = calculatePrintPrice({
    precoRolo: preco,
    pesoRolo: peso,
    gramas: g,
    quantidade: q,
    horas,
    minutos,
    maqHora,
    energiaHora: energia,
    outros,
    riscoFalhaPercent: falha,
    markupPercent: markup,
    descontoQuantidadePercent: desconto,
  });

  assert.equal(res.material, expMaterial);
  assert.equal(res.operacao, expOperacao);
  assert.equal(res.base, expBase);
  assert.equal(res.risco, expRisco);
  assert.equal(res.custo, expCusto);
  assert.equal(res.bruto, expBruto);
  assert.equal(res.descontoAplicado, expDesc);
  assert.equal(res.final, expFinal);
  assert.equal(res.precoPorUnidade, expFinal / q);
});

test('Regra de desconto por quantidade: aplicado apenas se q >= 10', () => {
  const baseInput = {
    precoRolo: 100,
    pesoRolo: 1000,
    gramas: 100,
    horas: 1,
    minutos: 0,
    maqHora: 4,
    energiaHora: 0.20,
    markupPercent: 40,
    descontoQuantidadePercent: 15,
  };

  // Para q = 1, desconto deve ser 0%
  const resQ1 = calculatePrintPrice({ ...baseInput, quantidade: 1 });
  assert.equal(resQ1.descontoAplicado, 0);
  assert.equal(resQ1.final, resQ1.bruto);

  // Para q = 9, desconto deve ser 0%
  const resQ9 = calculatePrintPrice({ ...baseInput, quantidade: 9 });
  assert.equal(resQ9.descontoAplicado, 0);
  assert.equal(resQ9.final, resQ9.bruto);

  // Para q = 10, desconto de 15% deve ser aplicado
  const resQ10 = calculatePrintPrice({ ...baseInput, quantidade: 10 });
  assert.equal(resQ10.descontoAplicado, 15);
  const esperadoFinalQ10 = resQ10.bruto * (1 - 15 / 100);
  assert.ok(Math.abs(resQ10.final - esperadoFinalQ10) < 0.0001);

  // Para q = 20 com 25% de desconto
  const resQ20 = calculatePrintPrice({ ...baseInput, quantidade: 20, descontoQuantidadePercent: 25 });
  assert.equal(resQ20.descontoAplicado, 25);
  const esperadoFinalQ20 = resQ20.bruto * (1 - 25 / 100);
  assert.ok(Math.abs(resQ20.final - esperadoFinalQ20) < 0.0001);
});

test('Validação de entradas rejeita preço/peso do rolo, gramas ou tempo <= 0', () => {
  // Preço do rolo zero ou negativo
  assert.throws(() => {
    calculatePrintPrice({ precoRolo: 0, pesoRolo: 1000, gramas: 50, horas: 1 });
  }, /Não foi possível calcular o preço/);

  // Peso do rolo zero ou negativo
  assert.throws(() => {
    calculatePrintPrice({ precoRolo: 100, pesoRolo: 0, gramas: 50, horas: 1 });
  }, /Não foi possível calcular o preço/);

  // Gramas zero ou negativas
  assert.throws(() => {
    calculatePrintPrice({ precoRolo: 100, pesoRolo: 1000, gramas: 0, horas: 1 });
  }, /Não foi possível calcular o preço/);

  // Tempo de impressão zero
  assert.throws(() => {
    calculatePrintPrice({ precoRolo: 100, pesoRolo: 1000, gramas: 50, horas: 0, minutos: 0 });
  }, /Não foi possível calcular o preço/);
});

test('extractTempoHoras extrai corretamente de minutos totais ou horas e minutos', () => {
  assert.equal(extractTempoHoras({ horas: 1, minutos: 30 }), 1.5);
  assert.equal(extractTempoHoras({ printTimeMinutes: 90 }), 1.5);
  assert.equal(extractTempoHoras({ tempoMinutos: 150 }), 2.5);
  assert.equal(extractTempoHoras({ tempo: 3.25 }), 3.25);
});

test('validatePricingInputs retorna lista clara de erros', () => {
  const validacaoInvalida = validatePricingInputs({
    precoRolo: -10,
    pesoRolo: 0,
    gramas: 0,
    tempo: 0,
  });
  assert.equal(validacaoInvalida.valid, false);
  assert.ok(validacaoInvalida.errors.length >= 4);

  const validacaoValida = validatePricingInputs({
    precoRolo: 100,
    pesoRolo: 1000,
    gramas: 50,
    tempo: 2,
    quantidade: 1,
  });
  assert.equal(validacaoValida.valid, true);
  assert.equal(validacaoValida.errors.length, 0);
});

test('Paridade exata com quantidade decimal: calcula sem Math.floor', () => {
  const inputs = {
    precoRolo: 120,
    pesoRolo: 1000,
    gramas: 40,
    quantidade: 2.5,
    horas: 1,
    minutos: 30,
    maqHora: 6,
    energiaHora: 0.4,
    outros: 1,
    riscoFalhaPercent: 10,
    markupPercent: 40,
    descontoQuantidadePercent: 15,
  };

  const res = calculatePrintPrice(inputs);

  // Verificação matemática idêntica a app.js:
  // q = Math.max(1, 2.5) = 2.5 (não truncado para 2)
  // material = (120 / 1000) * 40 * 2.5 = 12
  // tempo = 1 + 30/60 = 1.5 h
  // operacao = (6 + 0.4) * 1.5 = 9.6
  // base = 12 + 9.6 + 1 = 22.6
  // risco = 22.6 * 0.10 = 2.26
  // custo = 22.6 + 2.26 = 24.86
  // bruto = 24.86 * 1.40 = 34.804
  // desc = q >= 10 ? 15 : 0 => 0 (pois 2.5 < 10)
  // final = 34.804
  assert.equal(res.quantidade, 2.5);
  assert.equal(res.material, 12);
  assert.ok(Math.abs(res.operacao - 9.6) < 0.0001);
  assert.ok(Math.abs(res.base - 22.6) < 0.0001);
  assert.ok(Math.abs(res.risco - 2.26) < 0.0001);
  assert.ok(Math.abs(res.custo - 24.86) < 0.0001);
  assert.ok(Math.abs(res.bruto - 34.804) < 0.0001);
  assert.equal(res.descontoAplicado, 0);
  assert.ok(Math.abs(res.final - 34.804) < 0.0001);
  assert.ok(Math.abs(res.precoPorUnidade - (34.804 / 2.5)) < 0.0001);
});

test('Paridade da quantidade com piso mínimo e decimais válidos: 0.5 normaliza para 1 e 2.5 permanece 2.5', () => {
  const baseInput = {
    precoRolo: 100,
    pesoRolo: 1000,
    gramas: 50,
    horas: 1,
    minutos: 0,
    maqHora: 4,
    energiaHora: 0.20,
    outros: 0,
    riscoFalhaPercent: 10,
    markupPercent: 40,
  };

  // 1. Quantidade 0.5 normaliza para piso mínimo 1 (fórmula original Math.max(1, n('qtd')))
  const res05 = calculatePrintPrice({ ...baseInput, quantidade: 0.5 });
  assert.equal(res05.quantidade, 1);
  assert.equal(res05.material, 5);

  // 2. Quantidade 2.5 permanece exatamente 2.5 (preserva decimal sem arredondar ou truncar)
  const res25 = calculatePrintPrice({ ...baseInput, quantidade: 2.5 });
  assert.equal(res25.quantidade, 2.5);
  assert.equal(res25.material, 12.5);
});

