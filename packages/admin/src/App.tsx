import { Routes, Route } from "react-router-dom";
import { RequireAuth } from "./components/RequireAuth";
import { Setup } from "./pages/Setup";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { PostsList } from "./pages/PostsList";
import { PostEditor } from "./pages/PostEditor";
import { PageBuilder } from "./pages/PageBuilder";
import { Media } from "./pages/Media";
import { Agents } from "./pages/Agents";
import { Audit } from "./pages/Audit";
import { Settings } from "./pages/Settings";
import { Menus } from "./pages/Menus";
import { Tools } from "./pages/Tools";
import { ImportExport } from "./pages/ImportExport";

export function App() {
  return (
    <Routes>
      <Route path="/setup" element={<Setup />} />
      <Route path="/login" element={<Login />} />

      <Route element={<RequireAuth />}>
        <Route path="/" element={<Dashboard />} />

        <Route path="/posts" element={<PostsList postType="post" />} />
        <Route path="/posts/new" element={<PostEditor postType="post" />} />
        <Route path="/posts/:id" element={<PostEditor postType="post" />} />

        <Route path="/pages" element={<PostsList postType="page" />} />
        <Route path="/pages/new" element={<PageBuilder />} />
        <Route path="/pages/:id" element={<PageBuilder />} />
        {/* Escape hatch for pages still stored as Markdown. */}
        <Route path="/pages/:id/markdown" element={<PostEditor postType="page" />} />

        <Route path="/media" element={<Media />} />
        <Route path="/agents" element={<Agents />} />
        <Route path="/audit" element={<Audit />} />
        <Route path="/menus" element={<Menus />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/settings/:tab" element={<Settings />} />
        <Route path="/tools" element={<Tools />} />
        <Route path="/import" element={<ImportExport />} />
      </Route>
    </Routes>
  );
}
