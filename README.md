# Central dos Guias — Mostra SESI STEAM 2026

Aplicativo web (mobile-first) para os guias do Ensino Médio:

- **Alunos**: busca por nome (parcial, sem acento, sem diferença de maiúsculas) na base oficial consolidada e ficha com oficina, projeto, sala, dia, turno e horário.
- **Ônibus**: escolas visitantes ativas com cronômetro até a saída prevista e alerta de saída.
- **Mapa**: planta oficial publicada pela administração, com zoom por pinça.
- **Administração** (toque na logo + PIN): cadastro de ônibus, confirmação de partida, publicação do mapa, histórico com indicadores, auditoria e relatórios Excel/Word.

Projeto Vite (formato aceito pelo Google AI Studio), sem framework: o `index.tsx` só carrega `js/app.js`. As bibliotecas (Firebase, Lucide, ExcelJS, docx) vêm de CDN.

## Estrutura

```
index.html, index.tsx, css/, js/     → aplicativo
metadata.json                        → nome e descrição do app no AI Studio
package.json, vite.config.ts, tsconfig.json → build (npm run dev / npm run build)
public/sw.js, public/manifest.json   → notificações e ícone na tela inicial
docs/firestore.rules.txt             → regras de segurança do Firestore
ferramentas/montar_base.js           → gera public/dados_privados/base_oficial_estudantes.json
ferramentas/fontes_oficiais.js       → transcrição das listas da coordenação (fora do git)
public/dados_privados/               → base com nomes de estudantes (fora do git)
```

## Modos

| Modo | Quando | Dados |
|---|---|---|
| **Prévia local** | `FIREBASE_CONFIG = null` em `js/config.js` | Ficam só no navegador; avisos entre abas do mesmo aparelho. Faixa amarela "Prévia local" no topo. PIN conferido pelo hash `PIN_PREVIA_SHA256` em `js/config.js` (o número não fica no código). |
| **Firebase** | `FIREBASE_CONFIG` preenchido | Firestore em tempo real para todos os aparelhos. PIN = senha da conta administrativa no Authentication. |

## Configurar o Firebase (uma vez)

1. Crie um projeto em <https://console.firebase.google.com> e adicione um **app Web**. Copie o objeto `firebaseConfig` para `FIREBASE_CONFIG` em `js/config.js`.
2. **Authentication → Método de login**: ative **Anônimo** (guias) e **E-mail/senha** (administração).
3. **Authentication → Usuários → Adicionar usuário**: e-mail igual a `ADMIN_EMAIL` de `js/config.js` e, como senha, o PIN numérico do app (combinado com a coordenação; não registre o número neste repositório público). Se a quantidade de dígitos mudar, ajuste `PIN_DIGITOS` em `js/config.js`. Copie o **UID** criado.
4. **Firestore Database → Criar banco** (modo produção, região `southamerica-east1`).
5. **Firestore → Dados**: crie a coleção `admin_users` com um documento cujo **ID é o UID** do passo 3 (campo livre, ex.: `nome: "Guilherme Delfino"`).
6. **Firestore → Regras**: cole o conteúdo de `docs/firestore.rules.txt` e publique.
7. **Authentication → Configurações → Domínios autorizados**: adicione o domínio onde o app ficar hospedado.
8. Abra o app, entre na administração e toque em **PUBLICAR BASE OFICIAL**. Se o arquivo `public/dados_privados/base_oficial_estudantes.json` não estiver hospedado, o botão pede para escolher o arquivo no aparelho.

Coleções usadas: `students`, `student_presentations`, `school_visits`, `visit_groups`, `event_maps`, `admin_users`, `notifications`, `audit_logs`, `system_settings`.

## Atualizar a base de estudantes

1. Edite `ferramentas/fontes_oficiais.js` (formato explicado no topo do arquivo).
2. Rode `npm run base`: o script valida as linhas, junta o mesmo aluno em várias oficinas e imprime um resumo.
3. Na administração aparece o aviso de versão nova; publique.

## Limites conhecidos

- O login anônimo impede leitura por quem não abriu o app, mas qualquer pessoa com o link do app consegue abri-lo. Para restringir aos guias, seria preciso um login próprio dos guias.
- Notificações no aparelho funcionam com o app aberto ou em segundo plano. Para avisar com o navegador fechado é preciso Firebase Cloud Messaging com uma Cloud Function, o que exige o plano Blaze. No iPhone, as notificações só funcionam com o app adicionado à Tela de Início (iOS 16.4 ou mais recente).
- O mapa enviado do aparelho é otimizado para menos de 1 MB e salvo no Firestore; não usa o Cloud Storage, que exige o plano Blaze em projetos novos.
- O relógio usa o cabeçalho `Date` da hospedagem para corrigir o relógio do aparelho. Se ele não vier, o app usa o relógio do aparelho e avisa no formulário.

## Pré-visualizar localmente

```
npm install
npm run dev
```

Abra `http://localhost:3000/`. Para gerar a versão de produção: `npm run build` (saída em `dist/`).
