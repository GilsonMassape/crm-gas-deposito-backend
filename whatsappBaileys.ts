import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import * as fs from "fs";
import * as path from "path";

let sock: ReturnType<typeof makeWASocket> | null = null;
let isConnected = false;
let qrCode: string | null = null;

const AUTH_DIR = path.join(process.cwd(), "baileys_auth");

/**
 * Inicializa conexão WhatsApp com Baileys
 */
export async function initWhatsAppConnection() {
  try {
    // Criar diretório de autenticação se não existir
    if (!fs.existsSync(AUTH_DIR)) {
      fs.mkdirSync(AUTH_DIR, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: true,
    });

    sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        qrCode = qr;
        console.log("[WhatsApp] QR Code gerado! Escaneie no app.");
      }

      if (connection === "close") {
        const shouldReconnect =
          (lastDisconnect?.error as Boom)?.output?.statusCode !==
          DisconnectReason.loggedOut;

        console.log(
          "[WhatsApp] Conexão fechada. Reconectar?",
          shouldReconnect
        );

        isConnected = false;

        if (shouldReconnect) {
          initWhatsAppConnection();
        }
      } else if (connection === "open") {
        console.log("[WhatsApp] ✅ Conectado com sucesso!");
        isConnected = true;
        qrCode = null;
      }
    });

    sock.ev.on("creds.update", saveCreds);

    return { success: true };
  } catch (error: any) {
    console.error("[WhatsApp] Erro ao inicializar:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Envia mensagem WhatsApp via Baileys
 */
export async function enviarMensagemBaileys({
  telefone,
  mensagem,
}: { telefone: string; mensagem: string }): Promise<{ success: boolean; error?: string; messageId?: string }> {
  try {
    if (!sock || !isConnected) {
      return {
        success: false,
        error:
          "WhatsApp não conectado. Escaneie o QR Code em Configurações.",
      };
    }

    // Formatar número (formato: 5588996710011@s.whatsapp.net)
    let telefoneFormatado = telefone.replace(/\D/g, "");

    if (!telefoneFormatado.startsWith("55")) {
      telefoneFormatado = "55" + telefoneFormatado;
    }

    const jid = `${telefoneFormatado}@s.whatsapp.net`;

    console.log("[WhatsApp] Enviando mensagem para:", jid);

    // Enviar mensagem
    const result = await sock.sendMessage(jid, { text: mensagem });

    console.log("[WhatsApp] ✅ Mensagem enviada com sucesso!");

    return {
      success: true,
      messageId: result?.key?.id || "sent",
    };
  } catch (error: any) {
    console.error("[WhatsApp] Erro ao enviar mensagem:", error);
    return {
      success: false,
      error: error.message || "Erro ao enviar mensagem",
    };
  }
}

/**
 * Retorna status da conexão WhatsApp
 */
export function getWhatsAppStatus() {
  return {
    connected: isConnected,
    qrCode: qrCode,
  };
}

/**
 * Desconecta WhatsApp
 */
export async function disconnectWhatsApp() {
  if (sock) {
    await sock.logout();
    sock = null;
    isConnected = false;
    qrCode = null;

    // Limpar autenticação
    if (fs.existsSync(AUTH_DIR)) {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    }

    console.log("[WhatsApp] Desconectado com sucesso!");
  }
}

// Inicializar conexão automaticamente ao iniciar o servidor
initWhatsAppConnection();

