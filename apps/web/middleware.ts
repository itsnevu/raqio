import {NextResponse,type NextRequest} from "next/server";

// English lives at /, Indonesian at /id. Both render the same pages; the language travels in request headers.
export function middleware(request:NextRequest){
  const {pathname}=request.nextUrl;
  const id=pathname==="/id"||pathname.startsWith("/id/");
  const path=id?pathname.slice(3)||"/":pathname;
  const headers=new Headers(request.headers);
  headers.set("x-raqio-lang",id?"id":"en");
  headers.set("x-raqio-path",path);
  if(!id)return NextResponse.next({request:{headers}});
  const url=request.nextUrl.clone();
  url.pathname=path;
  return NextResponse.rewrite(url,{request:{headers}});
}
export const config={matcher:["/((?!_next/|media/|.*\\.[a-zA-Z0-9]+$).*)"]};
