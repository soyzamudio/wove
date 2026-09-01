import { Routes, Route } from "react-router-dom";
import { RequireAuth } from "./components/RequireAuth";
import { Setup } from "./pages/Setup";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { PostsList } from "./pages/PostsList";
import { PostEditor } from "./pages/PostEditor";
import { Media } from "./pages/Media";
import { Agents } from "./pages/Agents";
import { Audit } from "./pages/Audit";
import { Settings } from "./pages/Settings";
import { Tools } from "./pages/Tools";

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
        <Route path="/pages/new" element={<PostEditor postType="page" />} />
        <Route path="/pages/:id" element={<PostEditor postType="page" />} />

        <Route path="/media" element={<Media />} />
        <Route path="/agents" element={<Agents />} />
        <Route path="/audit" element={<Audit />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/tools" element={<Tools />} />
      </Route>
    </Routes>
  );
}
