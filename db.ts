import { eq, desc, and, sql, gte, lte, like, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { 
  InsertUser, users,
  vendedores, InsertVendedor,
  clientes, InsertCliente,
  produtos, InsertProduto,
  estoque, InsertEstoque,
  movimentacoesEstoque, InsertMovimentacaoEstoque,
  vendas, InsertVenda,
  itensVenda, InsertItemVenda,
  despesas, InsertDespesa,
  mensagens, InsertMensagem,
  campanhas, InsertCampanha,
  configWhatsapp, InsertConfigWhatsapp
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ============ USERS ============
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.id) {
    throw new Error("User ID is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = { id: user.id };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role === undefined) {
      if (user.id === ENV.ownerId) {
        user.role = 'admin';
        values.role = 'admin';
        updateSet.role = 'admin';
      }
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUser(id: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(users).orderBy(desc(users.createdAt));
}

// ============ VENDEDORES ============
export async function createVendedor(vendedor: InsertVendedor) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(vendedores).values(vendedor);
  return result;
}

export async function getVendedores(apenasAtivos = true) {
  const db = await getDb();
  if (!db) return [];
  
  if (apenasAtivos) {
    return await db.select().from(vendedores).where(eq(vendedores.ativo, true)).orderBy(vendedores.nome);
  }
  return await db.select().from(vendedores).orderBy(vendedores.nome);
}

export async function getVendedorById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(vendedores).where(eq(vendedores.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateVendedor(id: number, data: Partial<InsertVendedor>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.update(vendedores).set(data).where(eq(vendedores.id, id));
}

export async function deleteVendedor(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.update(vendedores).set({ ativo: false }).where(eq(vendedores.id, id));
}

// ============ CLIENTES ============
export async function checkClienteDuplicado(nome: string, telefone: string, excludeId?: number) {
  const db = await getDb();
  if (!db) return { nomeExiste: false, telefoneExiste: false, clientes: [] };
  
  const conditions = [];
  if (excludeId) {
    conditions.push(sql`${clientes.id} != ${excludeId}`);
  }
  
  const clientesComMesmoNome = await db.select().from(clientes)
    .where(and(
      eq(clientes.nome, nome),
      eq(clientes.ativo, true),
      ...conditions
    ));
  
  const clientesComMesmoTelefone = await db.select().from(clientes)
    .where(and(
      eq(clientes.telefone, telefone),
      eq(clientes.ativo, true),
      ...conditions
    ));
  
  return {
    nomeExiste: clientesComMesmoNome.length > 0,
    telefoneExiste: clientesComMesmoTelefone.length > 0,
    clientes: [...clientesComMesmoNome, ...clientesComMesmoTelefone]
  };
}

export async function createCliente(cliente: InsertCliente) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(clientes).values(cliente);
  return result;
}

export async function getClientes(filtros?: {
  bairro?: string;
  regiao?: string;
  busca?: string;
  apenasAtivos?: boolean;
}) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions = [];
  
  if (filtros?.apenasAtivos !== false) {
    conditions.push(eq(clientes.ativo, true));
  }
  
  if (filtros?.bairro) {
    conditions.push(eq(clientes.bairro, filtros.bairro));
  }
  
  if (filtros?.regiao) {
    conditions.push(eq(clientes.regiao, filtros.regiao));
  }
  
  if (filtros?.busca) {
    conditions.push(
      sql`(${clientes.nome} LIKE ${`%${filtros.busca}%`} OR ${clientes.telefone} LIKE ${`%${filtros.busca}%`})`
    );
  }
  
  return await db.select().from(clientes)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(clientes.nome);
}

export async function getClienteById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(clientes).where(eq(clientes.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateCliente(id: number, data: Partial<InsertCliente>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.update(clientes).set(data).where(eq(clientes.id, id));
}

export async function deleteCliente(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.update(clientes).set({ ativo: false }).where(eq(clientes.id, id));
}

// ============ PRODUTOS ============
export async function createProduto(produto: InsertProduto) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(produtos).values(produto);
  
  // Criar entrada de estoque inicial
  const produtoId = Number(result[0].insertId);
  await db.insert(estoque).values({
    produtoId,
    quantidade: 0
  });
  
  return result;
}

export async function getProdutos(apenasAtivos = true) {
  const db = await getDb();
  if (!db) return [];
  
  if (apenasAtivos) {
    return await db.select().from(produtos).where(eq(produtos.ativo, true)).orderBy(produtos.nome);
  }
  return await db.select().from(produtos).orderBy(produtos.nome);
}

export async function getProdutoById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(produtos).where(eq(produtos.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateProduto(id: number, data: Partial<InsertProduto>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.update(produtos).set(data).where(eq(produtos.id, id));
}

// ============ ESTOQUE ============
export async function getEstoque() {
  const db = await getDb();
  if (!db) return [];
  
  return await db
    .select({
      id: estoque.id,
      produtoId: estoque.produtoId,
      produtoNome: produtos.nome,
      produtoTipo: produtos.tipo,
      quantidade: estoque.quantidade,
      atualizadoEm: estoque.atualizadoEm
    })
    .from(estoque)
    .leftJoin(produtos, eq(estoque.produtoId, produtos.id))
    .where(eq(produtos.ativo, true));
}

export async function getEstoquePorProduto(produtoId: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(estoque).where(eq(estoque.produtoId, produtoId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function atualizarEstoque(produtoId: number, tipo: "entrada" | "saida", quantidade: number, usuarioId?: string, observacao?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Buscar estoque atual
  const estoqueAtual = await getEstoquePorProduto(produtoId);
  if (!estoqueAtual) {
    throw new Error("Produto não encontrado no estoque");
  }
  
  // Calcular nova quantidade
  const novaQuantidade = tipo === "entrada" 
    ? estoqueAtual.quantidade + quantidade 
    : estoqueAtual.quantidade - quantidade;
  
  if (novaQuantidade < 0) {
    throw new Error("Quantidade insuficiente em estoque");
  }
  
  // Atualizar estoque
  await db.update(estoque)
    .set({ quantidade: novaQuantidade })
    .where(eq(estoque.produtoId, produtoId));
  
  // Registrar movimentação
  await db.insert(movimentacoesEstoque).values({
    produtoId,
    tipo,
    quantidade,
    quantidadeAtual: novaQuantidade,
    observacao,
    usuarioId
  });
  
  return { quantidadeAnterior: estoqueAtual.quantidade, quantidadeAtual: novaQuantidade };
}

export async function getMovimentacoesEstoque(filtros?: {
  produtoId?: number;
  dataInicio?: Date;
  dataFim?: Date;
}) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions = [];
  
  if (filtros?.produtoId) {
    conditions.push(eq(movimentacoesEstoque.produtoId, filtros.produtoId));
  }
  
  if (filtros?.dataInicio) {
    conditions.push(gte(movimentacoesEstoque.criadoEm, filtros.dataInicio));
  }
  
  if (filtros?.dataFim) {
    conditions.push(lte(movimentacoesEstoque.criadoEm, filtros.dataFim));
  }
  
  return await db
    .select({
      id: movimentacoesEstoque.id,
      produtoId: movimentacoesEstoque.produtoId,
      produtoNome: produtos.nome,
      tipo: movimentacoesEstoque.tipo,
      quantidade: movimentacoesEstoque.quantidade,
      quantidadeAtual: movimentacoesEstoque.quantidadeAtual,
      observacao: movimentacoesEstoque.observacao,
      usuarioId: movimentacoesEstoque.usuarioId,
      usuarioNome: users.name,
      criadoEm: movimentacoesEstoque.criadoEm
    })
    .from(movimentacoesEstoque)
    .leftJoin(produtos, eq(movimentacoesEstoque.produtoId, produtos.id))
    .leftJoin(users, eq(movimentacoesEstoque.usuarioId, users.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(movimentacoesEstoque.criadoEm));
}

// ============ VENDAS ============
export async function createVenda(venda: InsertVenda, itens: Omit<InsertItemVenda, "vendaId">[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Inserir venda
  const resultVenda = await db.insert(vendas).values(venda);
  const vendaId = Number(resultVenda[0].insertId);
  
  // Inserir itens e atualizar estoque
  for (const item of itens) {
    await db.insert(itensVenda).values({
      ...item,
      vendaId
    });
    
    // Dar baixa no estoque
    await atualizarEstoque(
      item.produtoId, 
      "saida", 
      item.quantidade, 
      venda.usuarioId || undefined,
      `Venda #${vendaId}`
    );
  }
  
  return vendaId;
}

export async function getVendas(filtros?: {
  clienteId?: number;
  vendedorId?: number;
  dataInicio?: Date;
  dataFim?: Date;
}) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions = [];
  
  if (filtros?.clienteId) {
    conditions.push(eq(vendas.clienteId, filtros.clienteId));
  }
  
  if (filtros?.vendedorId) {
    conditions.push(eq(vendas.vendedorId, filtros.vendedorId));
  }
  
  if (filtros?.dataInicio) {
    conditions.push(gte(vendas.criadoEm, filtros.dataInicio));
  }
  
  if (filtros?.dataFim) {
    conditions.push(lte(vendas.criadoEm, filtros.dataFim));
  }
  
  return await db
    .select({
      id: vendas.id,
      clienteId: vendas.clienteId,
      clienteNome: clientes.nome,
      vendedorId: vendas.vendedorId,
      vendedorNome: vendedores.nome,
      formaPagamento: vendas.formaPagamento,
      total: vendas.total,
      lucro: vendas.lucro,
      observacoes: vendas.observacoes,
      criadoEm: vendas.criadoEm
    })
    .from(vendas)
    .leftJoin(clientes, eq(vendas.clienteId, clientes.id))
    .leftJoin(vendedores, eq(vendas.vendedorId, vendedores.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(vendas.criadoEm));
}

export async function getVendaById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const venda = await db
    .select({
      id: vendas.id,
      clienteId: vendas.clienteId,
      clienteNome: clientes.nome,
      clienteTelefone: clientes.telefone,
      vendedorId: vendas.vendedorId,
      vendedorNome: vendedores.nome,
      formaPagamento: vendas.formaPagamento,
      total: vendas.total,
      lucro: vendas.lucro,
      observacoes: vendas.observacoes,
      criadoEm: vendas.criadoEm
    })
    .from(vendas)
    .leftJoin(clientes, eq(vendas.clienteId, clientes.id))
    .leftJoin(vendedores, eq(vendas.vendedorId, vendedores.id))
    .where(eq(vendas.id, id))
    .limit(1);
  
  if (venda.length === 0) return undefined;
  
  const itens = await db
    .select({
      id: itensVenda.id,
      produtoId: itensVenda.produtoId,
      produtoNome: produtos.nome,
      quantidade: itensVenda.quantidade,
      precoUnitario: itensVenda.precoUnitario,
      subtotal: itensVenda.subtotal
    })
    .from(itensVenda)
    .leftJoin(produtos, eq(itensVenda.produtoId, produtos.id))
    .where(eq(itensVenda.vendaId, id));
  
  return {
    ...venda[0],
    itens
  };
}

// ============ DESPESAS ============
export async function createDespesa(despesa: InsertDespesa) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.insert(despesas).values(despesa);
}

export async function getDespesas(filtros?: {
  dataInicio?: Date;
  dataFim?: Date;
  categoria?: string;
}) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions = [];
  
  if (filtros?.dataInicio) {
    conditions.push(gte(despesas.data, filtros.dataInicio));
  }
  
  if (filtros?.dataFim) {
    conditions.push(lte(despesas.data, filtros.dataFim));
  }
  
  if (filtros?.categoria) {
    conditions.push(eq(despesas.categoria, filtros.categoria));
  }
  
  return await db
    .select({
      id: despesas.id,
      descricao: despesas.descricao,
      valor: despesas.valor,
      categoria: despesas.categoria,
      data: despesas.data,
      vendedorId: despesas.vendedorId,
      vendedorNome: vendedores.nome,
      observacoes: despesas.observacoes,
      usuarioNome: users.name,
      criadoEm: despesas.criadoEm
    })
    .from(despesas)
    .leftJoin(users, eq(despesas.usuarioId, users.id))
    .leftJoin(vendedores, eq(despesas.vendedorId, vendedores.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(despesas.data));
}

export async function updateDespesa(id: number, data: Partial<InsertDespesa>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.update(despesas)
    .set(data)
    .where(eq(despesas.id, id));
}

export async function deleteDespesa(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.delete(despesas).where(eq(despesas.id, id));
}

// ============ MENSAGENS ============
export async function createMensagem(mensagem: InsertMensagem) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.insert(mensagens).values(mensagem);
}

export async function getMensagens(filtros?: {
  clienteId?: number;
  tipo?: string;
  status?: string;
}) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions = [];
  
  if (filtros?.clienteId) {
    conditions.push(eq(mensagens.clienteId, filtros.clienteId));
  }
  
  if (filtros?.tipo) {
    conditions.push(eq(mensagens.tipo, filtros.tipo as any));
  }
  
  if (filtros?.status) {
    conditions.push(eq(mensagens.status, filtros.status as any));
  }
  
  return await db
    .select({
      id: mensagens.id,
      clienteId: mensagens.clienteId,
      clienteNome: clientes.nome,
      clienteTelefone: clientes.telefone,
      tipo: mensagens.tipo,
      conteudo: mensagens.conteudo,
      status: mensagens.status,
      dataEnvio: mensagens.dataEnvio,
      criadoEm: mensagens.criadoEm
    })
    .from(mensagens)
    .leftJoin(clientes, eq(mensagens.clienteId, clientes.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(mensagens.criadoEm));
}

export async function updateMensagemStatus(id: number, status: "pendente" | "enviada" | "erro" | "entregue" | "lida") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.update(mensagens).set({ status }).where(eq(mensagens.id, id));
}

// ============ CAMPANHAS ============
export async function createCampanha(campanha: InsertCampanha) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.insert(campanhas).values(campanha);
}

export async function getCampanhas() {
  const db = await getDb();
  if (!db) return [];
  
  return await db.select().from(campanhas).orderBy(desc(campanhas.criadoEm));
}

export async function getCampanhaById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(campanhas).where(eq(campanhas.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateCampanha(id: number, data: Partial<InsertCampanha>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.update(campanhas).set(data).where(eq(campanhas.id, id));
}

// ============ CONFIG WHATSAPP ============
export async function getConfigWhatsapp() {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(configWhatsapp).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function upsertConfigWhatsapp(config: Omit<InsertConfigWhatsapp, "id">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const existing = await getConfigWhatsapp();
  
  if (existing) {
    return await db.update(configWhatsapp).set(config).where(eq(configWhatsapp.id, existing.id));
  } else {
    return await db.insert(configWhatsapp).values(config);
  }
}

