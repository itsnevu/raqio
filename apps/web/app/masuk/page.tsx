import {redirect} from "next/navigation";
import {loginPath} from "../../content";

export default function AccessPage(){
  redirect(loginPath);
}
