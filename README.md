# Loja virtual da Zang Editora Cristã

Site da loja em **www.zangeditoracrista.com.br**: catálogo, carrinho, frete pela **SuperFrete**, pagamento pelo **Mercado Pago** (Pix, cartão e boleto) e hospedagem no **Netlify** com SSL.

## Como funciona

| Parte | Onde fica |
|---|---|
| Páginas do site (Astro) | `src/pages/` |
| Catálogo (preços, pesos, descrições) | `src/data/produtos.json`, gerado por `scripts/build_catalog.py` |
| Imagens dos produtos | `public/img/p/` |
| Frete, pagamento e pedidos | `netlify/functions/` e `server/` |
| Pedidos gravados | Netlify Blobs (armazenamento do próprio Netlify) |

Fluxo de uma compra:
1. O cliente monta o carrinho e calcula o frete pelo CEP (`/api/frete` consulta a SuperFrete).
2. Em **Finalizar compra**, preenche o endereço. O servidor recalcula preços e frete (nunca confia no navegador), grava o pedido e abre o pagamento no Mercado Pago (`/api/checkout`).
3. O Mercado Pago avisa o site quando o pagamento muda (`/api/mp-webhook`). Quando o pedido é **pago**:
   - você recebe um e-mail com o pedido e o endereço (Netlify Forms);
   - o envio é colocado no **carrinho da SuperFrete**, com o endereço do cliente. Lá você só confere, paga a etiqueta e imprime.
4. O cliente acompanha a situação na página `/pedido/`.
5. Você vê todos os pedidos em **/admin/** (com senha), muda a situação e informa o código de rastreio.

## Configuração no Netlify (uma vez só)

Em **Site configuration > Environment variables**, crie:

| Variável | O que colocar | Onde pegar |
|---|---|---|
| `MP_ACCESS_TOKEN` | Access Token de **produção** | Mercado Pago > Suas integrações > (sua aplicação) > Credenciais de produção |
| `MP_WEBHOOK_SECRET` | Assinatura secreta das notificações | Mercado Pago > Suas integrações > Webhooks > Configurar notificações (URL: `https://www.zangeditoracrista.com.br/api/mp-webhook`, evento **Pagamentos**) |
| `SUPERFRETE_TOKEN` | Token da API | SuperFrete > Integrações > Desenvolvedores > Integrar |
| `ADMIN_SENHA` | Senha do painel /admin/ (mínimo 8 caracteres) | Você escolhe |
| `SUPERFRETE_ENVIAR_CARRINHO` | `sim` ou `nao` | Opcional. `sim` (padrão) coloca o envio no carrinho da SuperFrete quando o pedido é pago |
| `PUBLIC_GOOGLE_VERIFICACAO` | Código da meta tag | Opcional. Google Search Console > Adicionar propriedade > Tag HTML |

Depois:
- **Forms > Enable form detection** (para o e-mail de pedido pago) e, em **Forms > Form notifications**, adicione um aviso por e-mail para o formulário `pedido-pago`.
- **Domain management**: adicione `www.zangeditoracrista.com.br` e `zangeditoracrista.com.br`. O SSL (cadeado) é ativado automaticamente.
- No **Registro.br**, aponte o DNS conforme o Netlify indicar.

Variáveis opcionais do remetente (já vêm com o endereço da editora): `CEP_ORIGEM`, `REMETENTE_NOME`, `REMETENTE_RUA`, `REMETENTE_NUMERO`, `REMETENTE_BAIRRO`, `REMETENTE_CIDADE`, `REMETENTE_UF`. Para testar a SuperFrete no ambiente de testes: `SUPERFRETE_AMBIENTE=sandbox`.

## Atualizar produtos e preços

1. Exporte de novo as planilhas do Mercado Livre (Anúncios > editar em massa) e da Shopee (atualização em massa, informações de vendas).
2. Rode:
   ```
   python3 scripts/build_catalog.py --ml ANUNCIOS_ML.xlsx --shopee SHOPEE.xlsx --imagens "F:/MERCADO SHOPS"
   ```
3. Confira `catalogo-revisao.xlsx` (linhas amarelas = peso ou medida estimados) e publique.

Produto novo: acrescente um bloco em `P = [...]` no `scripts/build_catalog.py` (nome, categoria, descrição, códigos dos anúncios e imagens).

Regras de preço: o site usa o **menor preço** entre Mercado Livre e Shopee; os preços por quantidade vêm do Mercado Livre e são aplicados automaticamente no carrinho.

## Desenvolvimento

```
npm install
npm test                         # testes do servidor (frete, pagamento, webhook, painel)
npm run build                    # gera o site em dist/
node tests/servidor-local.mjs    # testa tudo em http://localhost:4321 com SuperFrete e Mercado Pago simulados
```

## Google

- `sitemap-index.xml` e `robots.txt` são gerados automaticamente: envie o sitemap no Search Console.
- `google-merchant.xml` é o feed de produtos para o **Google Merchant Center** (aba Shopping gratuita): em Produtos > Feeds, adicione o feed agendado com a URL `https://www.zangeditoracrista.com.br/google-merchant.xml`.
- Cada página de produto tem dados estruturados (Product, Offer, ISBN quando existe).
