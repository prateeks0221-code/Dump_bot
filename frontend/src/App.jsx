import Nav from './components/Nav';
import Desk from './views/Desk';
import Stories from './views/Stories';
import StoryDesk from './views/StoryDesk';
import { useRoute } from './lib/router';

export default function App() {
  const { path, id } = useRoute();

  let view;
  if (path === '/stories' && id) view = <StoryDesk storyId={id} />;
  else if (path === '/stories') view = <Stories />;
  else view = <Desk />;

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0f0f11' }}>
      {/* Persistent top nav */}
      <div className="border-b" style={{ borderColor: '#27272a', backgroundColor: '#0f0f11' }}>
        <div className="max-w-[1100px] mx-auto px-4 py-2 flex items-center justify-between">
          <span className="text-[10px] font-mono tracking-widest uppercase" style={{ color: '#3f3f46' }}>
            DUMP_BOT
          </span>
          <Nav />
        </div>
      </div>
      {view}
    </div>
  );
}
