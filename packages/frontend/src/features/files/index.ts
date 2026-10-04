// File タブの公開境界。ページからは合成済みの FilesView のみを使う
// （サイドバーと本体シェルの共有状態を FilesView 内に閉じ込めるため、個別 export はしない）。
export { FilesView } from './components/files-view';
