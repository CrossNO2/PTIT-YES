"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

interface ShopContextType {
  shopId: string | null;
  shopName: string | null;
  memberRole: string | null;
  loading: boolean;
  refetch: () => Promise<void>;
}

const ShopContext = createContext<ShopContextType>({
  shopId: null,
  shopName: null,
  memberRole: null,
  loading: true,
  refetch: async () => {},
});

export function ShopProvider({ children }: { children: React.ReactNode }) {
  const [shopId, setShopId] = useState<string | null>(null);
  const [shopName, setShopName] = useState<string | null>(null);
  const [memberRole, setMemberRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchShop = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/me");
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setShopId(json.data.shop_id || null);
          setShopName(json.data.shop?.name || null);
          setMemberRole(json.data.member_role || null);
        } else {
          setShopId(null);
          setShopName(null);
          setMemberRole(null);
        }
      } else {
        setShopId(null);
      }
    } catch {
      setShopId(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchShop();
  }, [fetchShop]);

  return (
    <ShopContext.Provider
      value={{
        shopId,
        shopName,
        memberRole,
        loading,
        refetch: fetchShop,
      }}
    >
      {children}
    </ShopContext.Provider>
  );
}

export function useShop() {
  return useContext(ShopContext);
}
