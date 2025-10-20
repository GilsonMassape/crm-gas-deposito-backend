import * as db from "./db";

/**
 * Envia mensagem WhatsApp via Z-API
 */
export async function enviarMensagemWhatsApp(params: {
  telefone: string;
  mensagem: string;
}): Promise<{ success: boolean; error?: string; messageId?: string }> {
  try {
    // Buscar configuração do WhatsApp
    const config = await db.getConfigWhatsapp();
    
    if (!config || !config.accountSid || !config.authToken) {
      return {
        success: false,
        error: "WhatsApp não configurado. Configure em Configurações.",
      };
    }

    if (!config.ativo) {
      return {
        success: false,
        error: "WhatsApp está desativado nas configurações.",
      };
    }

    // Formatar número de destino (apenas números)
    let telefoneDestino = params.telefone.replace(/\D/g, "");
    
    // Adicionar código do país se não tiver
    if (!telefoneDestino.startsWith("55")) {
      telefoneDestino = "55" + telefoneDestino;
    }

    // URL da API Z-API
    const instanceId = config.accountSid;
    const token = config.authToken;
    const apiUrl = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`;

    // Preparar dados para Z-API
    const zapiData = {
      phone: telefoneDestino,
      message: params.mensagem,
    };

    console.log("[WhatsApp] Enviando mensagem via Z-API:", {
      url: apiUrl,
      phone: telefoneDestino,
    });

    // Fazer requisição para Z-API
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(zapiData),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("[WhatsApp] Erro ao enviar mensagem:", result);
      return {
        success: false,
        error: result.message || result.error || "Erro ao enviar mensagem",
      };
    }

    console.log("[WhatsApp] Mensagem enviada com sucesso:", result);
    
    return {
      success: true,
      messageId: result.messageId || result.id || "sent",
    };
  } catch (error: any) {
    console.error("[WhatsApp] Erro ao enviar mensagem:", error);
    return {
      success: false,
      error: error.message || "Erro desconhecido ao enviar mensagem",
    };
  }
}

