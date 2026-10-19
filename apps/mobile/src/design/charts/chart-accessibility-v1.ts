/** DOM ARIA belongs to web. Native charts are labelled by their accessible View. */
export function chartAriaV1(platform:string,label:string){return {enabled:platform==='web',description:label};}
