import { dialog, toast } from './ui/feedback';
import { read, write } from './storage';

/** Report a piece of content. Reports are stored under `reports` and read by the admin module. */
export function reportContent(context:string){
  dialog('Báo cáo nội dung','<p class="app-muted">Mô tả vấn đề bạn gặp với nội dung này.</p><label>Lý do báo cáo<textarea name="reason" required placeholder="Thông tin sai lệch, nội dung không phù hợp..."></textarea></label>','Lưu báo cáo',form=>{
    const reports=read<{context:string;reason:string}[]>('reports',[]);reports.push({context,reason:(form.elements.namedItem('reason') as HTMLTextAreaElement).value});write('reports',reports);toast('Đã lưu báo cáo trong bản demo.');
  });
}
