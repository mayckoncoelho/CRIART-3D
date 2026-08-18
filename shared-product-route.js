// Converte links públicos seguros (/produtos?produto=ID) para a rota interna do detalhe
// somente depois que o app principal já reconheceu /produtos como uma rota válida.
const url = new URL(location.href);
const productId = url.pathname.replace(/\/$/,'') === '/produtos' ? url.searchParams.get('produto') : null;
if (productId) {
  history.replaceState({ productId }, '', `/produto/${encodeURIComponent(productId)}`);
}
