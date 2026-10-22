// Configuração da Central dos Guias.
//
// FIREBASE: cole aqui o objeto "firebaseConfig" do console do Firebase
// (Configurações do projeto → Seus apps → Web). Enquanto ficar null,
// o app roda em PRÉVIA LOCAL: os dados ficam só no navegador deste aparelho.
export const FIREBASE_CONFIG = null;

// Conta do administrador no Firebase Authentication (e-mail/senha).
// A senha dessa conta é o PIN digitado no app (não escreva o PIN aqui: o repositório é público).
export const ADMIN_EMAIL = 'admin@centraldosguias.app';

// Escola anfitriã, exibida no cabeçalho abaixo de "Mostra SESI STEAM 2026".
export const ESCOLA_NOME = 'SESI João Ubaldo Ribeiro';

// Nome exibido no ambiente administrativo.
export const ADMIN_NOME = 'Guilherme Delfino';

// Imagens oficiais fornecidas pela coordenação.
export const LOGO_URL = 'https://i.postimg.cc/YCFTHPcv/Whats-App-Image-2026-10-21-at-22-28-34.jpg';
// Mapa oficial do evento: aparece para os guias sempre que a administração não publicou outro.
export const MAPA_OFICIAL_URL = 'https://i.postimg.cc/QdqwCTtc/39b0d1ef-0c2c-47ea-b7dd-b23072998f7f.jpg';

export const FUSO = 'America/Bahia';

// Professores que constam no mapa oficial, mas não na base de estudantes (busca "prof ...").
export const PROFESSORES_EXTRAS = [
  { nome: 'Adenilsa', local: 'Sala de Robótica', oficina: 'Oficina de Robótica', obs: 'Oficina distinta das equipes oficiais do professor Gotardo.', fonte: 'Mapa oficial da Mostra' },
];

// Datas de referência da edição 2026 (editáveis e confirmadas no Histórico).
export const DATAS_REFERENCIA = { dia1: '2026-10-22', dia2: '2026-10-23' };

// Arquivo gerado por ferramentas/montar_base.mjs. Não publicar em repositório público.
export const ARQUIVO_BASE = 'dados_privados/base_oficial_estudantes.json';

// Somente para a PRÉVIA LOCAL (sem Firebase). Com Firebase, quem valida é o Authentication.
// Guarda só o SHA-256 do PIN, para ele não ficar legível no código público.
// Para trocar: gere o hash do novo PIN (ex.: printf '%s' NOVOPIN | sha256sum) e cole aqui.
export const PIN_PREVIA_SHA256 = '0c08a9536b5dd78713f440acb930872fd69f7a71ad0cf9cdedc9628ddf9ac3d7';

// Quantidade de dígitos do PIN administrativo (círculos exibidos na tela de acesso).
export const PIN_DIGITOS = 7;

// Validade da sessão administrativa.
export const SESSAO_ADMIN_HORAS = 12;
