// 休眠中: frontend からの消費者は 0 件。Desk 個人タブの宛先グルーピング UI は撤去済みで、本モジュールは
// 現役の契約ではない（app.module.ts 経由でルートは生きている・撤去しない判断は ADR 0079）。
export { DeskGroupsModule } from './desk-groups.module';
export { DeskGroupsService } from './desk-groups.service';
