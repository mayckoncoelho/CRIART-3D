# CRIART 3D

Site da CRIART 3D — **Você imagina, a gente cria.**

## Estrutura atual

- `/` — página inicial
- `/produtos` — catálogo
- `/personalizados` — solicitação de projetos personalizados
- `/calculadora` — calculadora interna de impressão 3D
- `/admin` — painel administrativo inicial
- `/auth` — espaço reservado para autenticação segura

## Estado do painel administrativo

A versão inicial usa `localStorage` apenas para permitir testar cadastro e remoção de produtos e cupons no navegador. Antes de uso real, o painel será migrado para Firebase Authentication + banco/Storage, para que os dados sejam compartilhados entre dispositivos e o acesso administrativo seja protegido.

Não cadastre informações sensíveis nesta versão local.

## Firebase Hosting

O arquivo `firebase.json` já está configurado para hospedar esta aplicação de página única (SPA) e redirecionar as rotas para `index.html`.

Próximas etapas:

1. Criar/conectar o projeto no Firebase.
2. Ativar Firebase Authentication para o administrador.
3. Configurar banco de dados para produtos, cupons, banners e pedidos.
4. Configurar Storage para fotos dos produtos.
5. Configurar deploy pelo GitHub Actions/Firebase Hosting.
6. Substituir o armazenamento local do painel pelo Firebase.

## Segurança

O painel `/admin` ainda não deve ser considerado seguro até a integração do Firebase Authentication e das regras de acesso ao banco/Storage.
