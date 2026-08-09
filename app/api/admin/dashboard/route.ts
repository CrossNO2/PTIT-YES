import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireShopMembership } from "@/lib/auth/require-user";
import { formatErrorResponse, jsonError } from "@/lib/errors";

export async function GET(request: NextRequest) {
  try {
    const shopId = new URL(request.url).searchParams.get("shop_id");
    if (!shopId) return jsonError("shop_id parameter is required", "MISSING_SHOP_ID", 400);
    await requireShopMembership(shopId);
    const supabase = await createClient();

    const [ordersRes, routesRes, pickupsRes, reportsRes, vehiclesRes, shippersRes, recentOrdersRes] = await Promise.all([
      supabase.from("orders").select("id,status", { count: "exact" }).eq("shop_id", shopId),
      supabase.from("routes").select("id,status,route_date,optimized_distance_km,naive_distance_km,total_duration_mins,warehouse_id,vehicle_id,shipper_id,created_at,warehouses(name,address,lat,lng)").eq("shop_id", shopId).order("created_at", { ascending: false }).limit(200),
      supabase.from("packaging_pickups").select("id,status,verified_quantity_kg,estimated_quantity_kg,created_at").eq("shop_id", shopId),
      supabase.from("esg_reports").select("id,route_id,report_date,km_saved,co2_saved_kg,packaging_collected_kg,cost_saved_vnd,optimized_distance_km,created_at").eq("shop_id", shopId).order("report_date", { ascending: true }).limit(180),
      supabase.from("vehicles").select("id,status").eq("shop_id", shopId),
      supabase.from("shop_members").select("id,status").eq("shop_id", shopId).eq("member_role", "shipper"),
      supabase.from("orders").select("id,order_code,address,status,delivery_date,weight_kg,created_at").eq("shop_id", shopId).order("created_at", { ascending: false }).limit(5),
    ]);
    for (const r of [ordersRes,routesRes,pickupsRes,reportsRes,vehiclesRes,shippersRes,recentOrdersRes]) if (r.error) throw r.error;

    const routes = routesRes.data ?? [];
    const reports = reportsRes.data ?? [];
    const pickups = pickupsRes.data ?? [];
    const vehicles = vehiclesRes.data ?? [];
    const shippers = shippersRes.data ?? [];
    const activeRoute = routes.find(r => ["in_progress","assigned","approved"].includes(r.status)) ?? routes[0] ?? null;

    const routeSummary = routes.reduce<Record<string, number>>((acc, r) => { acc[r.status] = (acc[r.status] ?? 0) + 1; return acc; }, {});
    const totalPackagingKg = pickups.filter(p=>p.status === "completed").reduce((sum,p)=>sum+Number(p.verified_quantity_kg ?? p.estimated_quantity_kg ?? 0),0);
    const totalCo2SavedKg = reports.reduce((sum,r)=>sum+Number(r.co2_saved_kg ?? 0),0);
    const totalKmSaved = reports.reduce((sum,r)=>sum+Number(r.km_saved ?? 0),0);
    const totalCostSavedVnd = reports.reduce((sum,r)=>sum+Number(r.cost_saved_vnd ?? 0),0);

    const trendMap = new Map<string,{date:string;co2:number;km:number;packaging:number;cost:number}>();
    for (const report of reports) {
      const key = report.report_date;
      const row = trendMap.get(key) ?? { date:key,co2:0,km:0,packaging:0,cost:0 };
      row.co2 += Number(report.co2_saved_kg ?? 0); row.km += Number(report.km_saved ?? 0); row.packaging += Number(report.packaging_collected_kg ?? 0); row.cost += Number(report.cost_saved_vnd ?? 0);
      trendMap.set(key,row);
    }
    const performanceTrend = Array.from(trendMap.values()).slice(-30);

    let mapPoints: Array<{id:string;label:string;lat:number;lng:number;kind:"warehouse"|"delivery"|"pickup";status?:string}> = [];
    let upcomingActivities: Array<{id:string;type:string;label:string;status:string;sequence:number}> = [];
    if (activeRoute) {
      const warehouseRaw = Array.isArray(activeRoute.warehouses) ? activeRoute.warehouses[0] : activeRoute.warehouses;
      const warehouse = warehouseRaw as {name?:string;address?:string;lat?:number;lng?:number}|null;
      const { data: stops, error: stopsError } = await supabase.from("route_stops").select("id,stop_type,order_id,pickup_id,sequence_index,status").eq("route_id", activeRoute.id).order("sequence_index");
      if (stopsError) throw stopsError;
      const orderIds=(stops??[]).map(s=>s.order_id).filter(Boolean) as string[]; const pickupIds=(stops??[]).map(s=>s.pickup_id).filter(Boolean) as string[];
      const [{data:stopOrders,error:soErr},{data:stopPickups,error:spErr}] = await Promise.all([
        orderIds.length ? supabase.from("orders").select("id,order_code,address,lat,lng,status").in("id",orderIds) : Promise.resolve({data:[],error:null}),
        pickupIds.length ? supabase.from("packaging_pickups").select("id,address,lat,lng,status,packaging_type").in("id",pickupIds) : Promise.resolve({data:[],error:null}),
      ]);
      if (soErr) throw soErr; if (spErr) throw spErr;
      const om=new Map((stopOrders??[]).map(o=>[o.id,o])); const pm=new Map((stopPickups??[]).map(p=>[p.id,p]));
      for (const stop of stops??[]) {
        if (stop.stop_type === "warehouse" && warehouse?.lat != null && warehouse.lng != null) mapPoints.push({id:`warehouse-${stop.id}`,label:warehouse.name??"Kho",lat:Number(warehouse.lat),lng:Number(warehouse.lng),kind:"warehouse",status:stop.status});
        else if (stop.order_id && om.has(stop.order_id)) { const o=om.get(stop.order_id)!; mapPoints.push({id:o.id,label:o.order_code,lat:Number(o.lat),lng:Number(o.lng),kind:"delivery",status:o.status}); upcomingActivities.push({id:stop.id,type:"delivery",label:o.order_code,status:stop.status,sequence:stop.sequence_index}); }
        else if (stop.pickup_id && pm.has(stop.pickup_id)) { const p=pm.get(stop.pickup_id)!; mapPoints.push({id:p.id,label:`Thu gom · ${p.packaging_type}`,lat:Number(p.lat),lng:Number(p.lng),kind:"pickup",status:p.status}); upcomingActivities.push({id:stop.id,type:"pickup",label:p.packaging_type,status:stop.status,sequence:stop.sequence_index}); }
      }
    }

    return NextResponse.json({success:true,data:{
      summary:{ total_orders:ordersRes.count??0, active_routes:routes.filter(r=>["approved","assigned","in_progress"].includes(r.status)).length, total_packaging_kg:Number(totalPackagingKg.toFixed(1)), total_co2_saved_kg:Number(totalCo2SavedKg.toFixed(2)), active_vehicles:vehicles.filter(v=>v.status==='active').length, total_vehicles:vehicles.length, active_shippers:shippers.filter(s=>s.status==='active').length, total_km_saved:Number(totalKmSaved.toFixed(1)), total_cost_saved_vnd:Math.round(totalCostSavedVnd)},
      route_summary:routeSummary, active_route:activeRoute, map_points:mapPoints, upcoming_activities:upcomingActivities.slice(0,6), performance_trend:performanceTrend,
      recent_orders:recentOrdersRes.data??[], recent_reports:reports.slice(-5).reverse(),
    }});
  } catch (error: unknown) { const {status,body}=formatErrorResponse(error); return NextResponse.json(body,{status}); }
}
