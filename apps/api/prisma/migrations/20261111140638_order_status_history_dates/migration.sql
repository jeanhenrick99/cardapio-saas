-- Os pedidos antigos foram marcados como concluídos pela migration anterior, com a data
-- daquele momento, e por isso apareciam em "Concluídos (12 h)" do Kanban.
-- Eles passam a ter como data de conclusão a data em que foram feitos.
-- (Roda logo depois da migration anterior, antes de qualquer pedido ser concluído pelo Kanban.)
UPDATE "Order" SET "statusChangedAt" = "createdAt" WHERE "status" = 'COMPLETED';
