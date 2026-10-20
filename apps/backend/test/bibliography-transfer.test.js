import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {bibliographyFiles,withBiblatexResources,preserveDocumentMetadata,mergeTemplateBody,extractDocumentBody} from '../src/utils/texUtils.js';
import {copyAssets} from '../src/services/transferAgent/nodes/copyAssets.js';
import {applyTransfer} from '../src/services/transferAgent/nodes/applyTransfer.js';
import {fixCompile} from '../src/services/transferAgent/nodes/fixCompile.js';
import {fixLayout} from '../src/services/transferAgent/nodes/fixLayout.js';
const temp=mkdtempSync(path.join(tmpdir(),'spectrum-bib-transfer-'));
after(()=>rmSync(temp,{recursive:true,force:true}));
const template=String.raw`\documentclass{article}
\usepackage[style=apa,backend=biber]{biblatex}
\usepackage{hyperref}
\addbibresource{references.bib}
\begin{document}Template\printbibliography\end{document}`;

test('a quick switch reconnects custom source bibliographies and adapts classic commands',()=>{
 const source=String.raw`\documentclass{article}\begin{document}Body \cite{Mine}
\bibliographystyle{plain}\bibliography{data/myrefs,other}\end{document}`;
 const merged=withBiblatexResources(mergeTemplateBody(template,extractDocumentBody(source)),bibliographyFiles(source));
 assert.deepEqual(bibliographyFiles(merged),['data/myrefs.bib','other.bib']);
 assert.match(merged,/Body \\cite\{Mine\}/);
 assert.doesNotMatch(merged,/\\bibliography\{|\\bibliographystyle\{/);
 assert.equal((merged.match(/\\printbibliography/g)||[]).length,1);
 assert.ok(merged.indexOf('\\addbibresource{data/myrefs.bib}')<merged.indexOf('\\begin{document}'));
});

test('bibliography handling preserves comments and literal examples',()=>{
 const examples=String.raw`% \bibliography{comment}
\verb|\addbibresource{inline.bib}|
\begin{verbatim}\bibliography{example}\end{verbatim}
\\bibliography{escaped}`;
 const tex=template.replace('Template\\printbibliography',examples+'\nContent');
 assert.deepEqual(bibliographyFiles(examples),[]);
 const result=withBiblatexResources(tex,['mine.bib']);
 assert.ok(result.includes(examples));
 assert.match(result,/\\printbibliography\s*\\end\{document\}/);
 assert.equal(withBiblatexResources(result,['mine.bib']).match(/\\addbibresource\{mine\.bib\}/g).length,1);
 const classic=String.raw`\documentclass{article}\begin{document}\bibliography{old}\end{document}`;
 assert.equal(withBiblatexResources(classic,['mine.bib']),classic);
});

for(const mode of ['legacy','pdf'])test(`${mode} transfer connects a copied bibliography after a filename collision`,async()=>{
 const root=path.join(temp,mode),source=path.join(root,'source'),target=path.join(root,'target');
 await fs.mkdir(source,{recursive:true});await fs.mkdir(path.join(target,'chapters'),{recursive:true});
 const mine='@article{Mine,title={Source paper},year={2026}}\n';
 const sample='@book{Template,title={Template sample}}\n';
 await fs.writeFile(path.join(source,'references.bib'),mine);
 await fs.writeFile(path.join(target,'references.bib'),sample);
  const dest=mode==='legacy'?'assets/source/references-2.bib':'assets/source/references.bib';
  if(mode==='legacy'){
    await fs.mkdir(path.join(target,'assets/source'),{recursive:true});
    await fs.writeFile(path.join(target,'assets/source/references.bib'),'existing asset');
  }
 await fs.writeFile(path.join(target,'chapters/main.tex'),template.replace('Template\\printbibliography','Source \\cite{Mine}'));
 await copyAssets({transferMode:mode,sourceProjectRoot:source,sourceMainFile:'main.tex',sourceAssets:{bib:['references.bib']},targetProjectRoot:target,targetMainFile:'chapters/main.tex',jobId:'fixture'});
 assert.equal(await fs.readFile(path.join(target,'references.bib'),'utf8'),sample);
  assert.equal(await fs.readFile(path.join(target,dest),'utf8'),mine);
  if(mode==='legacy')assert.equal(await fs.readFile(path.join(target,'assets/source/references.bib'),'utf8'),'existing asset');
 const main=await fs.readFile(path.join(target,'chapters/main.tex'),'utf8');
  assert.deepEqual(bibliographyFiles(main),['../'+dest]);
 assert.match(main,/\\printbibliography/);
});

test('metadata preserves nested TeX, escaped names, empty dates and PDF properties',()=>{
 const source=String.raw`% \title{Not the title}
\newcommand{\example}{\title{Not a title either}}
\title{STEAM {AI} Pitch}\author{Longkai Li \& Ankie Cheung}\date{}
\begin{document}Source\end{document}`;
 const target=template.replace('\\begin{document}',String.raw`\title{Placeholder}\author{Your Name}\date{Wrong date}
\hypersetup{pdftitle={Placeholder},pdfauthor={Your Name},pdfsubject={Some,{nested} subject},pdflang={en-AU}}
\begin{document}`).replace('Template',String.raw`\title{Wrong body title}\author{Wrong person}\maketitle Body`);
 const result=preserveDocumentMetadata(target,source);
 assert.match(result,/\\title\{STEAM \{AI\} Pitch\}/);
 assert.match(result,/\\author\{Longkai Li \\\& Ankie Cheung\}/);
 assert.match(result,/\\date\{\}/);
 assert.match(result,/pdftitle=\{STEAM AI Pitch\},pdfauthor=\{Longkai Li \\\& Ankie Cheung\}/);
 assert.match(result,/pdfsubject=\{Some,\{nested\} subject\}/);
 assert.doesNotMatch(result,/Placeholder|Your Name|Wrong person|Wrong body title|Wrong date/);
 assert.doesNotMatch(result.slice(result.indexOf('\\begin{document}')),/\\(?:title|author|date)\{/);
 assert.equal(preserveDocumentMetadata(target,''),target,'missing source metadata is never invented');
});

test('metadata keeps a correct adaptation to the target class instead of restoring source-only macros',()=>{
 const source=String.raw`\title{STEAM AI Pitch}\author{\IEEEauthorblockN{Longkai Li}}\date{\today}\begin{document}Body\end{document}`;
 const target=template.replace('\\begin{document}',String.raw`\title{STEAM AI Pitch}\author{Longkai Li}\date{}\begin{document}`);
 const result=preserveDocumentMetadata(target,source);
 assert.match(result,/\\author\{Longkai Li\}/);
 assert.doesNotMatch(result,/IEEEauthorblockN/);
 assert.match(result,/\\date\{\\today\}/);
});

for(const mode of ['legacy','pdf'])test(`${mode} AI transfer and repair loops keep actual names and bibliography paths`,async(t)=>{
 const root=path.join(temp,'ai-'+mode);await fs.mkdir(root,{recursive:true});
 const original=String.raw`\title{STEAM AI Pitch}\author{Li \& Cheung}\date{}\begin{document}Original\end{document}`;
 const bad=template.replace('\\begin{document}',String.raw`\title{Your document title}\author{Your Name}\begin{document}`).replace('Template',String.raw`\title{Wrong body name}\maketitle Content \cite{Mine}`);
 t.mock.method(globalThis,'fetch',async(url)=>{
  assert.equal(new URL(url).hostname,'model.invalid');
  return new Response(JSON.stringify({choices:[{message:{content:bad}}]}));
 });
 const state={transferMode:mode,sourceFullContent:original,targetTemplateContent:template,targetProjectRoot:root,targetMainFile:'main.tex',jobId:'fixture',llmConfig:{endpoint:'https://model.invalid/v1',apiKey:'test',model:'test'}};
 await applyTransfer(state);
 let result=await fs.readFile(path.join(root,'main.tex'),'utf8');
 assert.match(result,/\\title\{STEAM AI Pitch\}/);
 assert.doesNotMatch(result,/Your document title|Your Name|Wrong body name/);
 result=withBiblatexResources(result,['assets/source/references.bib']);
 for(const fix of [fixCompile,fixLayout]){
  await fs.writeFile(path.join(root,'main.tex'),result);
  await fix(state);
  const fixed=await fs.readFile(path.join(root,'main.tex'),'utf8');
  assert.deepEqual(bibliographyFiles(fixed),['assets/source/references.bib']);
  assert.match(fixed,/\\title\{STEAM AI Pitch\}/);
  assert.doesNotMatch(fixed,/Your document title|Your Name|Wrong body name/);
 }
});

test('AI conversion compiles the actual names, PDF properties and copied source references',async(t)=>{
 for(const command of ['pdflatex','biber'])if(spawnSync(command,['--version'],{windowsHide:true}).status!==0)return t.skip(`needs ${command}`);
 const root=path.join(temp,'compiled-ai'),source=path.join(root,'source'),target=path.join(root,'target');
 await fs.mkdir(source,{recursive:true});await fs.mkdir(target,{recursive:true});
 const bib='@article{Mine,author={Li, Longkai},title={Source paper},journal={Example Journal},year={2026},url={https://example.com/source-study}}\n';
 await fs.writeFile(path.join(source,'references.bib'),bib);
 await fs.writeFile(path.join(target,'references.bib'),'@book{Sample,title={Template sample}}\n');
 const bad=template.replace('\\begin{document}',String.raw`\title{Your document title}\author{Your Name}\hypersetup{pdftitle={Your document title},pdfauthor={Your Name}}\begin{document}`).replace('Template',String.raw`\title{Wrong body name}\maketitle Converted text \cite{Mine}.`);
 t.mock.method(globalThis,'fetch',async(url)=>{
  assert.equal(new URL(url).hostname,'model.invalid');
  return new Response(JSON.stringify({choices:[{message:{content:bad}}]}));
 });
 const state={sourceProjectRoot:source,sourceMainFile:'main.tex',sourceAssets:{bib:['references.bib']},sourceFullContent:String.raw`\title{STEAM AI Pitch}\author{Longkai Li \& Ankie Cheung}\date{}\begin{document}Original\end{document}`,targetTemplateContent:template,targetProjectRoot:target,targetMainFile:'main.tex',jobId:'fixture',llmConfig:{endpoint:'https://model.invalid/v1',apiKey:'test',model:'test'}};
 await applyTransfer(state);await copyAssets(state);
 for(const[command,args]of[['pdflatex',['-interaction=nonstopmode','-halt-on-error','main.tex']],['biber',['main']],['pdflatex',['-interaction=nonstopmode','-halt-on-error','main.tex']],['pdflatex',['-interaction=nonstopmode','-halt-on-error','main.tex']]]){
  const result=spawnSync(command,args,{cwd:target,encoding:'utf8',windowsHide:true,timeout:30000});
  assert.equal(result.status,0,result.error?.message||result.stdout+result.stderr);
 }
 const log=await fs.readFile(path.join(target,'main.log'),'utf8');
 assert.doesNotMatch(log,/Citation .*undefined|Can be used only in preamble|Please \(re\)run Biber/);
 const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const task=getDocument({data:new Uint8Array(await fs.readFile(path.join(target,'main.pdf')))});
 const document=await task.promise;
 try{
  const {info}=await document.getMetadata();
  assert.equal(info.Title,'STEAM AI Pitch');assert.equal(info.Author,'Longkai Li & Ankie Cheung');
  let text='';for(let i=1;i<=document.numPages;i++)text+=(await(await document.getPage(i)).getTextContent()).items.map(item=>item.str||'').join(' ');
  assert.match(text,/STEAM AI Pitch/);assert.match(text,/Source paper/);
  assert.doesNotMatch(text,/Your document title|Your Name|Wrong body name|Template sample/);
  assert.ok(text.replace(/\s/g,'').includes('https://example.com/source-study'));
 }finally{await task.destroy();}
 assert.equal(await fs.readFile(path.join(source,'references.bib'),'utf8'),bib);
});
