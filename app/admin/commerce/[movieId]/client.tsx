"use client";

import { useState } from "react";
import Image from "next/image";
import { DiscoveryRun, MovieProduct } from "@/lib/types";

export default function CommerceAdminClient({ initialProducts, movieId, latestRun }: { initialProducts: MovieProduct[], movieId: string, latestRun?: DiscoveryRun | null }) {
  const [products, setProducts] = useState<MovieProduct[]>(initialProducts);
  const [discovering, setDiscovering] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const activeCount = products.filter(p => p.status === "active").length;
  const needsReviewCount = products.filter(p => p.status === "needs_review").length;
  const rejectedCount = products.filter(p => p.status === "rejected").length;
  const staleCount = products.filter(p => p.status === "stale").length;

  async function handleTestConnection() {
    setActionLoading("test_connection");
    try {
      const res = await fetch("/api/admin/commerce/health");
      const data = await res.json();
      if (res.ok) {
        alert(`Status: ${data.status}\nConfiguration: ${data.configuration}\nAuthentication: ${data.authentication}\nMarketplace: ${data.marketplace}`);
      } else {
        alert(`Status: ${data.status || "Failed"}\nConfiguration: ${data.configuration || "Unknown"}\nAuthentication: ${data.authentication || "Failed"}`);
      }
    } catch (e) {
      alert("Error testing Amazon connection.");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRunDiscovery() {
    setDiscovering(true);
    try {
      const res = await fetch("/api/admin/commerce/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ movieId }),
      });
      const data = await res.json();
      if (res.ok) {
        window.location.reload();
      } else {
        alert(`Discovery failed: ${data.message || data.error}`);
      }
    } catch (e) {
      alert("Error running discovery.");
    } finally {
      setDiscovering(false);
    }
  }

  async function handleReverify(productId: string) {
    setActionLoading(productId);
    try {
      const res = await fetch(`/api/admin/commerce/products/${productId}/reverify`, {
        method: "POST"
      });
      if (res.ok) {
        const { product } = await res.json();
        setProducts(prev => prev.map(p => p.id === productId ? product : p));
      } else {
        alert("Reverify failed");
      }
    } catch (e) {
      alert("Error reverifying product");
    } finally {
      setActionLoading(null);
    }
  }

  async function updateStatus(productId: string, newStatus: MovieProduct["status"]) {
    setActionLoading(productId);
    try {
      const res = await fetch(`/api/admin/commerce/products/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, enabled: newStatus === "active" }),
      });
      if (res.ok) {
        setProducts(prev => prev.map(p => p.id === productId ? { ...p, status: newStatus, enabled: newStatus === "active" } : p));
      } else {
        alert("Update failed");
      }
    } catch (e) {
      alert("Error updating product");
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div>
      {latestRun && latestRun.status === "failed" && (
        <div className="bg-red-500/10 border border-red-500/50 p-4 rounded-xl mb-8">
          <h2 className="text-red-400 font-bold mb-1">Discovery Failed: {latestRun.errorCode}</h2>
          <p className="text-red-300/80 text-sm">{latestRun.errorMessage}</p>
        </div>
      )}

      {/* Header Stats */}
      <div className="flex items-center justify-between bg-white/[0.04] p-6 rounded-2xl border border-white/10 mb-8">
        <div className="flex gap-8 flex-wrap">
          <div>
            <div className="text-sm text-white/50 mb-1">Total Products</div>
            <div className="text-2xl font-bold">{products.length}</div>
          </div>
          <div>
            <div className="text-sm text-white/50 mb-1">Active</div>
            <div className="text-2xl font-bold text-green-400">{activeCount}</div>
          </div>
          <div>
            <div className="text-sm text-white/50 mb-1">Needs Review</div>
            <div className="text-2xl font-bold text-amber-400">{needsReviewCount}</div>
          </div>
          <div>
            <div className="text-sm text-white/50 mb-1">Rejected</div>
            <div className="text-2xl font-bold text-red-400">{rejectedCount}</div>
          </div>
          {latestRun && latestRun.status !== "failed" && (
            <div className="border-l border-white/10 pl-8 ml-4">
              <div className="text-sm text-white/50 mb-1">Last Run ({latestRun.provider})</div>
              <div className="text-sm text-white/80">
                {latestRun.resultsReturned} returned → {latestRun.resultsDeduplicated} unique
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-4 shrink-0 ml-4">
          <button
            onClick={handleTestConnection}
            disabled={actionLoading === "test_connection"}
            className="bg-white/10 hover:bg-white/20 text-white px-6 py-3 rounded-xl font-semibold transition disabled:opacity-50"
          >
            {actionLoading === "test_connection" ? "Testing..." : "Test Amazon Connection"}
          </button>
          <button
            onClick={handleRunDiscovery}
            disabled={discovering}
            className="bg-primary hover:bg-primary/90 text-white px-6 py-3 rounded-xl font-semibold transition disabled:opacity-50"
          >
            {discovering ? "Searching..." : "Run Discovery"}
          </button>
        </div>
      </div>

      {/* Product List */}
      <div className="space-y-4">
        {products.map(p => (
          <div key={p.id} className="flex gap-6 bg-white/[0.02] p-4 rounded-2xl border border-white/10 relative">
            <div className="relative h-32 w-32 shrink-0 bg-white/5 rounded-xl overflow-hidden">
              <Image src={p.image} alt={p.title} fill className="object-cover" />
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-lg leading-tight truncate">{p.title}</h3>
                  <div className="text-sm text-white/50 mt-1">
                    {p.merchant} • {p.currency} {p.price ?? "N/A"} • Relevance: {Math.round(p.relevanceScore * 100)}%
                  </div>
                </div>
                <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase
                  ${p.status === 'active' ? 'bg-green-500/20 text-green-400' : 
                    p.status === 'needs_review' ? 'bg-amber-500/20 text-amber-400' : 
                    p.status === 'rejected' ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-white/60'}`}
                >
                  {p.status.replace("_", " ")}
                </div>
              </div>

              <div className="mt-3 text-sm bg-white/[0.03] p-3 rounded-lg border border-white/5">
                <div className="font-medium text-white/80 mb-1">Reason: {p.relevanceReason}</div>
                <div className="text-xs text-white/40 font-mono">
                  Query: "{p.discoveryQuery}" | Provider: {p.provider} | ID: {p.merchantProductId}
                </div>
              </div>

              <div className="mt-4 flex gap-3">
                <a 
                  href={p.canonicalProductUrl || p.affiliateUrl} 
                  target="_blank"
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium transition"
                >
                  Open Product
                </a>
                
                {p.status !== "active" && (
                  <button 
                    onClick={() => updateStatus(p.id, "active")}
                    disabled={actionLoading === p.id}
                    className="px-4 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg text-sm font-medium transition"
                  >
                    Approve
                  </button>
                )}
                
                {p.status !== "rejected" && (
                  <button 
                    onClick={() => updateStatus(p.id, "rejected")}
                    disabled={actionLoading === p.id}
                    className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-sm font-medium transition"
                  >
                    Reject
                  </button>
                )}
                
                {p.status === "active" && (
                  <button 
                    onClick={() => updateStatus(p.id, "disabled")}
                    disabled={actionLoading === p.id}
                    className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-medium transition"
                  >
                    Disable
                  </button>
                )}
                
                <button 
                  onClick={() => handleReverify(p.id)}
                  disabled={actionLoading === p.id}
                  className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg text-sm font-medium transition ml-auto"
                >
                  {actionLoading === p.id ? "..." : "Reverify"}
                </button>
              </div>
            </div>
          </div>
        ))}
        {products.length === 0 && (
          <div className="text-center py-20 text-white/50">
            No products discovered yet. Run Discovery to fetch candidates.
          </div>
        )}
      </div>
    </div>
  );
}
