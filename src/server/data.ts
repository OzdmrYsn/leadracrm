// Veri katmanı. Rota işleyicileri yalnız buradan dışa açılan işlevleri çağırır; ekranlar veritabanını bilmez.
// İşlevler Postgres'e yazar (src/server/pg). Her çağrı oturumdaki kullanıcının kimliğiyle tek bir işlemde
// çalışır; satır düzeyi güvenlik (RLS) veritabanında uygulanır. Kurallar replica/architecture.md ile aynıdır:
// aşama değişiminde ön koşul, client_token ile tekil gönderim, aynı sohbetten gelen ikinci mesajın yeni lead açmaması.
export { DataError } from "./errors";
export { createAutomation, deleteAutomation, listAutomations, updateAutomation } from "./pg/automations";
export { createIntake, deleteIntake, importLeads, listIntakes, noteIntakeError, receiveIntake, rotateIntake, updateIntake } from "./pg/intake";
export * from "./pg/billing";
export * from "./pg/channels";
export * from "./pg/chat";
export { exportCompanies, exportContacts, exportLeads } from "./pg/exports";
export * from "./pg/fields";
export { getInsights } from "./pg/insights";
export * from "./pg/invitations";
export * from "./pg/leads";
export * from "./pg/pipelines";
export * from "./pg/records";
export * from "./pg/saved-filters";
export * from "./pg/tasks";
export * from "./pg/team";
