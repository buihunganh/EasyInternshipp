/** Job detail page: show the job passed as ?job=<title>. */
export function setupJobDetail() {
  const title=new URLSearchParams(location.search).get('job');if(title){document.querySelector('h1')!.textContent=title;document.title=title+' | Internships.io';}
}
