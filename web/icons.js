// Small, locally rendered UI symbols. No icon-font download is required.
const paths={
 microphone:'M9 5a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0V5M6 10v2a6 6 0 0 0 12 0v-2M12 18v4M9 22h6',
 'microphone-slash':'M9 8V5a3 3 0 0 1 6 0v6M6 10v2a6 6 0 0 0 10 4M12 18v4M9 22h6M3 3l18 18',
 play:'M8 4l12 8-12 8V4',pause:'M8 5v14M16 5v14',stop:'M6 6h12v12H6Z',spinner:'M12 3a9 9 0 1 1-9 9',
 'user-plus':'M6 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0M2 21v-2a8 8 0 0 1 13-6M19 11v8M15 15h8',
 user:'M8 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0M4 21v-2a8 8 0 0 1 16 0v2',
 'user-graduate':'M2 7l10-4 10 4-10 4L2 7M6 9v5a6 6 0 0 0 12 0V9M4 22a8 8 0 0 1 16 0M22 7v7',
 'chalkboard-user':'M9 3h12v12h-6M5 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6M1 22v-2a4 4 0 0 1 8 0v2M12 8h5M12 11h3',
 'arrow-right-arrow-left':'M3 7h18M17 3l4 4-4 4M21 17H3M7 13l-4 4 4 4',
 'arrow-left':'M20 12H4M10 6l-6 6 6 6','arrow-right':'M4 12h16M14 6l6 6-6 6',
 'chevron-down':'M5 9l7 7 7-7','chevron-right':'M9 5l7 7-7 7',
 'xmark':'M6 6l12 12M18 6L6 18',check:'M4 12l5 5L20 6',plus:'M12 4v16M4 12h16',
 copy:'M8 8h12v13H8ZM4 16H2V2h13v2',camera:'M3 6h5l2-3h4l2 3h5v15H3ZM8 13a4 4 0 1 0 8 0 4 4 0 0 0-8 0',
 pen:'M4 16L16 4l4 4L8 20l-5 1 1-5M14 6l4 4',
 language:'M2 5h12M8 2v3M4 8c2 5 5 7 9 9M12 5c-1 5-4 9-9 12M13 21l4-11 4 11M15 17h4',
 'magnifying-glass':'M3 10a7 7 0 1 0 14 0 7 7 0 0 0-14 0M15 15l7 7',
 keyboard:'M2 5h20v14H2ZM5 9h1M9 9h1M13 9h1M17 9h1M5 13h1M9 13h1M13 13h1M17 13h1M7 16h10',
 'paper-plane':'M2 10L22 2l-8 20-3-9-9-3ZM11 13L22 2',
 'right-to-bracket':'M14 3h7v18h-7M2 12h13M10 7l5 5-5 5',
 'door-open':'M10 3l9-1v20l-9-1V3M3 21h7M15 12h.1',
 'rotate-right':'M20 7a9 9 0 1 0 1 9M20 2v6h-6',
 'network-wired':'M8 2h8v6H8ZM12 8v6M4 14h16M4 14v3M20 14v3M1 17h6v5H1ZM17 17h6v5h-6Z',
 'book-open':'M12 5C8 2 4 2 2 3v17c4-1 7-1 10 2 3-3 6-3 10-2V3c-4-1-7-1-10 2v17',
 'book-medical':'M5 2h15v20H5a3 3 0 0 1 0-6h15M3 19V5a3 3 0 0 1 2-3M12 6v6M9 9h6',
 comments:'M2 3h15v11H8l-5 4v-4H2V3M18 9h4v13l-5-3h-6v-3',
 'comment-dots':'M2 3h20v14H9l-6 5v-5H2V3M7 10h.1M12 10h.1M17 10h.1'
};
export function decorateIcon(node,name){
 if(node.classList.contains('local-icon')||!paths[name])return node;
 node.classList.add('local-icon');node.setAttribute('aria-hidden','true');
 const doc=node.ownerDocument,svg=doc.createElementNS('http://www.w3.org/2000/svg','svg'),path=doc.createElementNS('http://www.w3.org/2000/svg','path');
 for(const [k,v] of Object.entries({viewBox:'0 0 24 24',width:'1em',height:'1em',fill:'none',stroke:'currentColor','stroke-width':'2','stroke-linecap':'round','stroke-linejoin':'round',focusable:'false','aria-hidden':'true'}))svg.setAttribute(k,v);
 path.setAttribute('d',paths[name]);svg.append(path);node.replaceChildren(svg);return node;
}
export function localIcon(name,doc=document){const node=doc.createElement('i');node.className='fa-solid fa-'+name;return decorateIcon(node,name);}
export function installLocalIcons(root=document){
 const visit=node=>{if(node.nodeType!==1&&node.nodeType!==9)return;const list=[...(node.matches?.('.fa-solid')?[node]:[]),...node.querySelectorAll('.fa-solid:not(.local-icon)')];for(const icon of list){const name=[...icon.classList].find(c=>c.startsWith('fa-')&&c!=='fa-solid')?.slice(3);decorateIcon(icon,name);}};
 visit(root);const observer=new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)visit(node);});observer.observe(root,{childList:true,subtree:true});return ()=>observer.disconnect();
}
