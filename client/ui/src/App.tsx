import React from 'react';
import { Link, Route, Routes, useParams } from 'react-router-dom';

import type { UIComponentProps } from '../ui-core';
import ConsensusPanel from './components/ConsensusPanel';
import ESSBrowser from './components/ESSBrowser';
import MeshDashboard from './components/MeshDashboard';
import UlxViewer from './components/UlxViewer';

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="text-sm font-semibold tracking-wide">HGI-MX</div>
          <nav className="flex gap-4 text-sm text-zinc-300">
            <Link className="hover:text-white" to="/mesh">
              Mesh
            </Link>
            <Link className="hover:text-white" to="/consensus">
              Consensus
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}

function Home() {
  return (
    <Layout>
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">UI</h1>
        <p className="text-sm text-zinc-300">Routes:</p>
        <div className="grid gap-2 text-sm">
          <Link className="text-indigo-300 hover:text-indigo-200" to="/mesh">
            /mesh
          </Link>
          <Link className="text-indigo-300 hover:text-indigo-200" to="/consensus">
            /consensus
          </Link>
          <Link className="text-indigo-300 hover:text-indigo-200" to="/ulx/example">
            /ulx/:id
          </Link>
          <Link className="text-indigo-300 hover:text-indigo-200" to="/ess/example">
            /ess/:id
          </Link>
        </div>
      </div>
    </Layout>
  );
}

function UlxPage() {
  const { id } = useParams();
  const props: UIComponentProps = { id: id ?? '' };
  return (
    <Layout>
      <UlxViewer {...props} />
    </Layout>
  );
}

function EssPage() {
  const { id } = useParams();
  const props: UIComponentProps = { id: id ?? '' };
  return (
    <Layout>
      <ESSBrowser {...props} />
    </Layout>
  );
}

function MeshPage() {
  return (
    <Layout>
      <MeshDashboard />
    </Layout>
  );
}

function ConsensusPage() {
  return (
    <Layout>
      <ConsensusPanel />
    </Layout>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/mesh" element={<MeshPage />} />
      <Route path="/consensus" element={<ConsensusPage />} />
      <Route path="/ulx/:id" element={<UlxPage />} />
      <Route path="/ess/:id" element={<EssPage />} />
    </Routes>
  );
}
