# Refatoração GusTech

## Melhorias implementadas
- light mode redesenhado com contraste melhor, estados de hover mais elegantes e legibilidade reforçada em cards, formulários, tabelas e painéis
- admin em light mode com superfície mais limpa, bordas suaves, badges e áreas de ação mais consistentes
- design system unificado via `GusTech/css/shared.css`, com sombras, tokens de cor, superfícies e foco visual mais premium
- transições globais mais suaves e entrada de página refinada
- backend modular com camadas separadas por rotas, serviços e repositórios
- catálogo de produtos migrado para MySQL com API dedicada
- carrinho migrado para MySQL com API dedicada
- reviews consolidadas no MySQL com atualização automática de nota média e quantidade
- checkout ajustado para gravar pedidos no backend e limpar itens comprados do carrinho SQL
- camada de compatibilidade `GusTech/js/api-compat.js` para manter as páginas atuais funcionando com a nova API sem reescrever todo o frontend de uma vez
- validações centralizadas de perfil, endereço, pedido e avaliação
- segurança reforçada com prepared statements, `helmet`, rate limit, sanitização básica e tratamento de erros consistente

## Novos arquivos principais
- `backend/src/routes/products.js`
- `backend/src/routes/cart.js`
- `backend/src/repositories/productRepository.js`
- `backend/src/repositories/cartRepository.js`
- `backend/src/services/productService.js`
- `backend/src/services/cartService.js`
- `GusTech/js/api-compat.js`

## Mudanças arquiteturais
- Firebase deixou de ser a origem principal do catálogo, carrinho, avaliações e pedidos novos
- Firebase Auth continua como mecanismo de identidade para não quebrar login e permissões já existentes
- MySQL agora armazena usuários, endereços, admins, produtos, carrinho, pedidos, itens, timeline e avaliações
- o frontend agora usa a API/compat layer como caminho principal para catálogo e carrinho

## O que ainda ficou no Firebase
- autenticação e emissão/validação de token
- alguns fluxos de fallback no frontend ainda existem para evitar quebra total caso o backend não esteja disponível

## Próximo passo recomendado
- numa segunda passada, remover os fallbacks legados restantes das páginas `admin.html`, `produto.html` e `conta.html` para operar exclusivamente com a API e eliminar a dependência final do Firestore no frontend
