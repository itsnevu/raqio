type Scene="research"|"team"|"local";

export default function PrincipleIllustration({scene}:{scene:Scene}){
  return <div className="principle-illustration" data-scene={scene} aria-hidden="true"/>;
}
