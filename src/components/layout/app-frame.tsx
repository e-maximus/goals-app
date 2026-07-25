import { MeProvider } from "@/features/account";
import { loadMe } from "@/features/account/load";
import { Topbar } from "./topbar";

/**
 * The frame every page shares: the fixed header, and the identity behind it.
 *
 * It lives in the layouts rather than inside each page for two reasons. The
 * header keeps its state (and the chip its identity) across navigation instead
 * of remounting per page; and the identity is resolved here, on the server, so
 * no component has to fetch it — see {@link MeProvider}.
 */
export async function AppFrame({ children }: { children: React.ReactNode }) {
  const me = await loadMe();
  return (
    <MeProvider me={me}>
      {/* The Topbar is out of flow, so the frame reserves its height with pt-16. */}
      <div className="flex flex-1 flex-col pt-16">
        <Topbar />
        {children}
      </div>
    </MeProvider>
  );
}
