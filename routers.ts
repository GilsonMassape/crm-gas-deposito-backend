import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { enviarMensagemBaileys, getWhatsAppStatus, disconnectWhatsApp } from "./whatsappBaileys";

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ============ VENDEDORES ============
  vendedores: router({
    list: protectedProcedure
      .input(z.object({ apenasAtivos: z.boolean().optional().default(true) }).optional())
      .query(async ({ input }) => {
        return await db.getVendedores(input?.apenasAtivos);
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await db.getVendedorById(input.id);
      }),

    create: protectedProcedure
      .input(z.object({
        nome: z.string().min(1),
        telefone: z.string().optional(),
        comissao: z.number().optional().default(0),
      }))
      .mutation(async ({ input }) => {
        return await db.createVendedor(input);
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        nome: z.string().min(1).optional(),
        telefone: z.string().optional(),
        comissao: z.number().optional(),
        ativo: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        return await db.updateVendedor(id, data);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        return await db.deleteVendedor(input.id);
      }),
  }),

  // ============ CLIENTES ============
  clientes: router({
    list: protectedProcedure
      .input(z.object({
        bairro: z.string().optional(),
        regiao: z.string().optional(),
        busca: z.string().optional(),
        apenasAtivos: z.boolean().optional().default(true),
      }).optional())
      .query(async ({ input }) => {
        return await db.getClientes(input);
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await db.getClienteById(input.id);
      }),

    checkDuplicado: protectedProcedure
      .input(z.object({
        nome: z.string(),
        telefone: z.string(),
        excludeId: z.number().optional(),
      }))
      .query(async ({ input }) => {
        return await db.checkClienteDuplicado(input.nome, input.telefone, input.excludeId);
      }),

    create: protectedProcedure
      .input(z.object({
        nome: z.string().min(1),
        telefone: z.string().min(1),
        endereco: z.string().optional(),
        bairro: z.string().optional(),
        regiao: z.string().optional(),
        observacoes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        return await db.createCliente(input);
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        nome: z.string().min(1).optional(),
        telefone: z.string().min(1).optional(),
        endereco: z.string().optional(),
        bairro: z.string().optional(),
        regiao: z.string().optional(),
        observacoes: z.string().optional(),
        ativo: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        return await db.updateCliente(id, data);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        return await db.deleteCliente(input.id);
      }),
  }),

  // ============ PRODUTOS ============
  produtos: router({
    list: protectedProcedure
      .input(z.object({ apenasAtivos: z.boolean().optional().default(true) }).optional())
      .query(async ({ input }) => {
        return await db.getProdutos(input?.apenasAtivos);
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await db.getProdutoById(input.id);
      }),

    create: protectedProcedure
      .input(z.object({
        nome: z.string().min(1),
        tipo: z.enum(["gas_p13", "agua_mineral", "agua_dessalinizada"]),
        precoCompra: z.number().min(0),
        precoVenda: z.number().min(0),
      }))
      .mutation(async ({ input }) => {
        return await db.createProduto(input);
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        nome: z.string().min(1).optional(),
        tipo: z.enum(["gas_p13", "agua_mineral", "agua_dessalinizada"]).optional(),
        precoCompra: z.number().min(0).optional(),
        precoVenda: z.number().min(0).optional(),
        ativo: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        return await db.updateProduto(id, data);
      }),
  }),

  // ============ ESTOQUE ============
  estoque: router({
    list: protectedProcedure.query(async () => {
      return await db.getEstoque();
    }),

    getByProduto: protectedProcedure
      .input(z.object({ produtoId: z.number() }))
      .query(async ({ input }) => {
        return await db.getEstoquePorProduto(input.produtoId);
      }),

    atualizar: protectedProcedure
      .input(z.object({
        produtoId: z.number(),
        tipo: z.enum(["entrada", "saida"]),
        quantidade: z.number().min(1),
        observacao: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        return await db.atualizarEstoque(
          input.produtoId,
          input.tipo,
          input.quantidade,
          ctx.user?.id,
          input.observacao
        );
      }),

    movimentacoes: protectedProcedure
      .input(z.object({
        produtoId: z.number().optional(),
        dataInicio: z.date().optional(),
        dataFim: z.date().optional(),
      }).optional())
      .query(async ({ input }) => {
        return await db.getMovimentacoesEstoque(input);
      }),
  }),

  // ============ VENDAS ============
  vendas: router({
    list: protectedProcedure
      .input(z.object({
        clienteId: z.number().optional(),
        vendedorId: z.number().optional(),
        dataInicio: z.date().optional(),
        dataFim: z.date().optional(),
      }).optional())
      .query(async ({ input }) => {
        return await db.getVendas(input);
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await db.getVendaById(input.id);
      }),

    create: protectedProcedure
      .input(z.object({
        clienteId: z.number(),
        vendedorId: z.number(),
        formaPagamento: z.enum(["dinheiro", "cartao_credito", "cartao_debito", "pix", "outros"]),
        observacoes: z.string().optional(),
        itens: z.array(z.object({
          produtoId: z.number(),
          quantidade: z.number().min(1),
          precoUnitario: z.number().min(0),
          subtotal: z.number().min(0),
        })).min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        const { itens, ...vendaData } = input;
        
        // Calcular total e lucro
        const total = itens.reduce((sum, item) => sum + item.subtotal, 0);
        
        // Buscar preços de compra para calcular lucro
        let lucro = 0;
        for (const item of itens) {
          const produto = await db.getProdutoById(item.produtoId);
          if (produto) {
            const custoItem = produto.precoCompra * item.quantidade;
            lucro += item.subtotal - custoItem;
          }
        }
        
        const vendaId = await db.createVenda(
          {
            ...vendaData,
            total,
            lucro,
            usuarioId: ctx.user?.id,
          },
          itens
        );
        
        return { vendaId, total, lucro };
      }),
  }),

  // ============ DESPESAS ============
  despesas: router({
    list: protectedProcedure
      .input(z.object({
        dataInicio: z.date().optional(),
        dataFim: z.date().optional(),
        categoria: z.string().optional(),
      }).optional())
      .query(async ({ input }) => {
        return await db.getDespesas(input);
      }),

    create: protectedProcedure
      .input(z.object({
        descricao: z.string().min(1),
        valor: z.number().min(0),
        categoria: z.string().optional(),
        vendedorId: z.number().optional(),
        observacoes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        return await db.createDespesa({
          ...input,
          data: new Date(),
          usuarioId: ctx.user?.id,
        });
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        descricao: z.string().min(1).optional(),
        valor: z.number().min(0).optional(),
        categoria: z.string().optional(),
        vendedorId: z.number().optional(),
        observacoes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        return await db.updateDespesa(id, data);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        return await db.deleteDespesa(input.id);
      }),
  }),

  // ============ MENSAGENS ============
  mensagens: router({
    list: protectedProcedure
      .input(z.object({
        clienteId: z.number().optional(),
        tipo: z.string().optional(),
        status: z.string().optional(),
      }).optional())
      .query(async ({ input }) => {
        return await db.getMensagens(input);
      }),

    create: protectedProcedure
      .input(z.object({
        clienteId: z.number(),
        tipo: z.enum(["automatica", "promocao", "data_especial", "manual"]),
        conteudo: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        // Buscar dados do cliente
        const cliente = await db.getClienteById(input.clienteId);
        if (!cliente) {
          throw new Error("Cliente não encontrado");
        }

        if (!cliente.telefone) {
          throw new Error("Cliente não possui telefone cadastrado");
        }

        // Enviar mensagem via WhatsApp
        const resultado = await enviarMensagemBaileys({         telefone: cliente.telefone,
          mensagem: input.conteudo,
        });

        // Salvar mensagem no banco de dados
        await db.createMensagem({
          ...input,
          status: resultado.success ? "enviada" : "erro",
          dataEnvio: resultado.success ? new Date() : null,
          usuarioId: ctx.user?.id,
        });

        if (!resultado.success) {
          throw new Error(resultado.error || "Erro ao enviar mensagem");
        }

        return {
          success: true,
          messageId: resultado.messageId,
        };
      }),

    updateStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["pendente", "enviada", "erro", "entregue", "lida"]),
      }))
      .mutation(async ({ input }) => {
        return await db.updateMensagemStatus(input.id, input.status);
      }),
  }),

  // ============ CAMPANHAS ============
  campanhas: router({
    list: protectedProcedure.query(async () => {
      return await db.getCampanhas();
    }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await db.getCampanhaById(input.id);
      }),

    create: protectedProcedure
      .input(z.object({
        nome: z.string().min(1),
        tipo: z.enum(["promocao", "data_especial", "reativacao"]),
        mensagem: z.string().min(1),
        filtros: z.string().optional(),
        dataAgendamento: z.date().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        return await db.createCampanha({
          ...input,
          usuarioId: ctx.user?.id,
        });
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        nome: z.string().optional(),
        tipo: z.enum(["promocao", "data_especial", "reativacao"]).optional(),
        mensagem: z.string().optional(),
        filtros: z.string().optional(),
        status: z.enum(["rascunho", "agendada", "enviada", "cancelada"]).optional(),
        dataAgendamento: z.date().optional(),
        dataEnvio: z.date().optional(),
        totalClientes: z.number().optional(),
        totalEnviadas: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        return await db.updateCampanha(id, data);
      }),
  }),

  // ============ CONFIG WHATSAPP ============
  whatsapp: router({
    getStatus: publicProcedure.query(() => {
      return getWhatsAppStatus();
    }),
    disconnect: protectedProcedure.mutation(async () => {
      await disconnectWhatsApp();
      return { success: true };
    }),
    getConfig: publicProcedure.query(async () => {
      return await db.getConfigWhatsapp();
    }),


    updateConfig: protectedProcedure
      .input(z.object({
        accountSid: z.string().optional(),
        authToken: z.string().optional(),
        numeroWhatsapp: z.string().optional(),
        ativo: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        return await db.upsertConfigWhatsapp(input);
      }),
  }),

  // ============ RELATÓRIOS ============
  relatorios: router({
    dashboard: protectedProcedure
      .input(z.object({
        dataInicio: z.date().optional(),
        dataFim: z.date().optional(),
      }).optional())
      .query(async ({ input }) => {
        const vendas = await db.getVendas(input);
        const estoque = await db.getEstoque();
        const despesas = await db.getDespesas(input);
        
        const totalVendas = vendas.reduce((sum, v) => sum + v.total, 0);
        const totalLucro = vendas.reduce((sum, v) => sum + v.lucro, 0);
        const totalDespesas = despesas.reduce((sum, d) => sum + d.valor, 0);
        const lucroLiquido = totalLucro - totalDespesas;
        
        return {
          totalVendas,
          totalLucro,
          totalDespesas,
          lucroLiquido,
          quantidadeVendas: vendas.length,
          estoque,
        };
      }),

    vendasPorVendedor: protectedProcedure
      .input(z.object({
        dataInicio: z.date().optional(),
        dataFim: z.date().optional(),
      }).optional())
      .query(async ({ input }) => {
        const vendas = await db.getVendas(input);
        
        const porVendedor = vendas.reduce((acc, venda) => {
          const key = venda.vendedorId;
          if (!acc[key]) {
            acc[key] = {
              vendedorId: venda.vendedorId,
              vendedorNome: venda.vendedorNome,
              totalVendas: 0,
              totalLucro: 0,
              quantidadeVendas: 0,
            };
          }
          acc[key].totalVendas += venda.total;
          acc[key].totalLucro += venda.lucro;
          acc[key].quantidadeVendas += 1;
          return acc;
        }, {} as Record<number, any>);
        
        return Object.values(porVendedor);
      }),

    vendasPorRegiao: protectedProcedure
      .input(z.object({
        dataInicio: z.date().optional(),
        dataFim: z.date().optional(),
      }).optional())
      .query(async ({ input }) => {
        const vendas = await db.getVendas(input);
        const clientesMap = new Map();
        
        // Buscar informações de região dos clientes
        for (const venda of vendas) {
          if (!clientesMap.has(venda.clienteId)) {
            const cliente = await db.getClienteById(venda.clienteId);
            clientesMap.set(venda.clienteId, cliente);
          }
        }
        
        const porRegiao = vendas.reduce((acc, venda) => {
          const cliente = clientesMap.get(venda.clienteId);
          const regiao = cliente?.regiao || "Sem região";
          
          if (!acc[regiao]) {
            acc[regiao] = {
              regiao,
              totalVendas: 0,
              totalLucro: 0,
              quantidadeVendas: 0,
            };
          }
          acc[regiao].totalVendas += venda.total;
          acc[regiao].totalLucro += venda.lucro;
          acc[regiao].quantidadeVendas += 1;
          return acc;
        }, {} as Record<string, any>);
        
        return Object.values(porRegiao);
      }),

    vendasPorFormaPagamento: protectedProcedure
      .input(z.object({
        dataInicio: z.date().optional(),
        dataFim: z.date().optional(),
      }).optional())
      .query(async ({ input }) => {
        const vendas = await db.getVendas(input);
        
        const porFormaPagamento = vendas.reduce((acc, venda) => {
          const forma = venda.formaPagamento;
          if (!acc[forma]) {
            acc[forma] = {
              formaPagamento: forma,
              totalVendas: 0,
              quantidadeVendas: 0,
            };
          }
          acc[forma].totalVendas += venda.total;
          acc[forma].quantidadeVendas += 1;
          return acc;
        }, {} as Record<string, any>);
        
        return Object.values(porFormaPagamento);
      }),
  }),
});

export type AppRouter = typeof appRouter;

