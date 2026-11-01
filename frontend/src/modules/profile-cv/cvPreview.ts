/** CV builder: mirror contact inputs into the live preview. Must run before saved values are restored. */
export function setupCvPreview() {
  for(const field of ['email','phone','location']){
    const input=document.getElementById(`input-${field}`) as HTMLInputElement|null;
    const preview=document.getElementById(`preview-${field}`);
    input?.addEventListener('input',()=>{if(preview)preview.textContent=input.value;});
  }
}
