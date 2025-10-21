"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  BarChart3,
  MessageSquare,
  Users,
  TrendingUp,
  Clock,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Brain,
  FileText,
  Mail,
  PhoneCall,
} from "lucide-react";
import Link from "next/link";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from "recharts";

interface DashboardStats {
  totalChats: number;
  todayChats: number;
  avgResponseTime: number;
  successRate: number;
  activeUsers: number;
  errorRate: number;
  totalTokens: number;
  avgSessionDuration: number;
  totalSubmissions: number;
  todaySubmissions: number;
  pendingSubmissions: number;
  contactForms: number;
  tradeInForms: number;
}

interface RecentActivity {
  id: string;
  user_id: string;
  prompt: string;
  response: string;
  timestamp: string;
  status: "success" | "error" | "pending";
  processing_time: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalChats: 0,
    todayChats: 0,
    avgResponseTime: 0,
    successRate: 0,
    activeUsers: 0,
    errorRate: 0,
    totalTokens: 0,
    avgSessionDuration: 0,
    totalSubmissions: 0,
    todaySubmissions: 0,
    pendingSubmissions: 0,
    contactForms: 0,
    tradeInForms: 0,
  });
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<"week" | "month">("week");
  const [chartData, setChartData] = useState<
    { date: string; current: number; previous: number }[]
  >([]);
  const [wcTopProducts, setWcTopProducts] = useState<
    Array<{
      id: number;
      name: string;
      total_sales: number;
      price: number;
      stock_quantity: number;
    }>
  >([]);
  // Demo GA data for dashboard widgets (mirrors detailed page samples)
  const [gaTopPages, setGaTopPages] = useState<
    Array<{ page: string; views: number }>
  >([
    { page: "/products/wireless-headphones", views: 980 },
    { page: "/products/gaming-keyboards", views: 820 },
    { page: "/products/bluetooth-speakers", views: 760 },
    { page: "/products/usb-hubs", views: 640 },
    { page: "/blog/best-headphones-2024", views: 610 },
  ]);
  const [gaDevices, setGaDevices] = useState<
    Array<{ name: string; value: number }>
  >([
    { name: "Mobile", value: 58 },
    { name: "Desktop", value: 34 },
    { name: "Tablet", value: 8 },
  ]);
  const [scTraffic, setScTraffic] = useState<
    {
      date: string;
      clicks: number;
      impressions: number;
      prevClicks: number;
      prevImpressions: number;
    }[]
  >([]);
  const [gaTraffic, setGaTraffic] = useState<
    { date: string; current: number; previous: number }[]
  >([]);
  const [trafficDays, setTrafficDays] = useState<7 | 28 | 90>(28);

  const fetchDashboardStats = useCallback(async () => {
    try {
      setRefreshing(true);

      const { count: totalChats } = await supabase
        .from("chat_logs")
        .select("*", { count: "exact", head: true });

      const today = new Date().toISOString().split("T")[0];
      const { count: todayChats } = await supabase
        .from("chat_logs")
        .select("*", { count: "exact", head: true })
        .gte("created_at", today);

      const { data: successfulChats } = await supabase
        .from("chat_logs")
        .select("status")
        .eq("status", "success");

      const { data: errorChats } = await supabase
        .from("chat_logs")
        .select("status")
        .eq("status", "error");

      const successRate = totalChats
        ? ((successfulChats?.length || 0) / totalChats) * 100
        : 0;
      const errorRate = totalChats
        ? ((errorChats?.length || 0) / totalChats) * 100
        : 0;

      const { data: uniqueUsers } = await supabase
        .from("chat_logs")
        .select("user_id")
        .gte("created_at", today);

      const activeUsers = new Set(uniqueUsers?.map((u) => u.user_id) || [])
        .size;

      const { data: processingTimes } = await supabase
        .from("chat_logs")
        .select("processing_time")
        .not("processing_time", "is", null)
        .limit(100);

      const avgResponseTime = processingTimes?.length
        ? processingTimes.reduce(
            (sum, log) => sum + (log.processing_time || 0),
            0,
          ) / processingTimes.length
        : 1.2;

      const { data: recentLogs } = await supabase
        .from("chat_logs")
        .select(
          "id, user_id, prompt, response, created_at, status, processing_time",
        )
        .order("created_at", { ascending: false })
        .limit(10);

      setRecentActivity(
        recentLogs?.map((log) => ({
          id: log.id,
          user_id: log.user_id,
          prompt: log.prompt,
          response: log.response,
          timestamp: log.created_at,
          status: log.status as "success" | "error" | "pending",
          processing_time: log.processing_time || 0,
        })) || [],
      );

      setStats((prev) => ({
        ...prev,
        totalChats: totalChats || 0,
        todayChats: todayChats || 0,
        avgResponseTime: Math.round(avgResponseTime * 100) / 100,
        successRate: Math.round(successRate),
        activeUsers,
        errorRate: Math.round(errorRate),
      }));

      try {
        const { data: wcSnap } = await supabase
          .from("wc_snapshots")
          .select("top_products, ts")
          .order("ts", { ascending: false })
          .limit(1)
          .single();
        if (wcSnap?.top_products) {
          setWcTopProducts((wcSnap.top_products as any[]).slice(0, 3));
        }
      } catch (e) {
        // non-fatal if Woo snapshot table not present
      }

      const daysNeeded = Math.max(trafficDays * 2, 60);
      const since = new Date();
      since.setDate(since.getDate() - daysNeeded);
      const { data: periodLogs } = await supabase
        .from("chat_logs")
        .select("id, created_at")
        .gte("created_at", since.toISOString());

      if (periodLogs) {
        const now = new Date();
        const currentRangeStart = new Date(now);
        currentRangeStart.setDate(now.getDate() - trafficDays);
        const previousRangeStart = new Date(currentRangeStart);
        previousRangeStart.setDate(currentRangeStart.getDate() - trafficDays);

        const currentCounts = new Map<string, number>();
        const previousCounts = new Map<string, number>();

        periodLogs.forEach((log) => {
          const created = new Date(log.created_at);
          const dateKey = created.toISOString().split("T")[0];
          if (created >= currentRangeStart) {
            currentCounts.set(dateKey, (currentCounts.get(dateKey) || 0) + 1);
          } else if (created >= previousRangeStart) {
            previousCounts.set(dateKey, (previousCounts.get(dateKey) || 0) + 1);
          }
        });

        const combined: { date: string; current: number; previous: number }[] =
          [];
        for (let i = trafficDays - 1; i >= 0; i--) {
          const d = new Date(currentRangeStart);
          d.setDate(currentRangeStart.getDate() + i);
          const dateKey = d.toISOString().split("T")[0];
          combined.push({
            date: dateKey,
            current: currentCounts.get(dateKey) || 0,
            previous: previousCounts.get(dateKey) || 0,
          });
        }
        setChartData(combined);
      }

      setRefreshing(false);
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      setRefreshing(false);
    }
  }, [trafficDays]);

  useEffect(() => {
    fetchDashboardStats().finally(() => setLoading(false));
  }, [fetchDashboardStats]);

  // Fetch GA website traffic for selected range
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(
          `/api/ga/daily-traffic?days=${trafficDays}&metric=newUsers`,
          { cache: "no-store" },
        );
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json.data)) setGaTraffic(json.data);
        }
      } catch (e) {
        console.error("Failed to load GA traffic", e);
      }
    })();
  }, [trafficDays]);

  // Fetch Search Console daily clicks/impressions
  useEffect(() => {
    (async () => {
      try {
        // Use Supabase API route instead of legacy route
        const res = await fetch(`/api/sc/supabase?days=${trafficDays}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const json = await res.json();
          // Map the Supabase response format to the expected format
          if (json.dailyData && Array.isArray(json.dailyData)) {
            const mappedData = json.dailyData.map((day) => ({
              date: day.date,
              clicks: day.clicks,
              impressions: day.impressions,
            }));
            setScTraffic(mappedData);
          }
        }
      } catch (e) {
        console.error("Failed to load SC traffic", e);
      }
    })();
  }, [trafficDays]);

  const statCards = [
    {
      title: "Total Conversations",
      value: (stats.totalChats || 0).toLocaleString(),
      description: "All time conversations",
      icon: MessageSquare,
      color: "text-primary",
      trend: "+12%",
    },
    {
      title: "Today's Chats",
      value: (stats.todayChats || 0).toLocaleString(),
      description: "Conversations today",
      icon: TrendingUp,
      color: "text-emerald-400",
      trend: "+8%",
    },
    {
      title: "Form Submissions",
      value: (stats.totalSubmissions || 0).toLocaleString(),
      description: "Total form submissions",
      icon: FileText,
      color: "text-purple-400",
      trend: `${(stats.todaySubmissions || 0) > 0 ? "+" : ""}${stats.todaySubmissions || 0} today`,
    },
    {
      title: "Success Rate",
      value: `${stats.successRate || 0}%`,
      description: "Successful interactions",
      icon: CheckCircle,
      color: "text-green-400",
      trend: "+2%",
    },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600">
            Welcome to your chatbot analytics dashboard
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="space-y-2">
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                <div className="h-8 bg-gray-200 rounded w-1/2"></div>
              </CardHeader>
              <CardContent>
                <div className="h-4 bg-gray-200 rounded w-full"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const handleRefresh = () => {
    fetchDashboardStats();
  };

  return (
    <div className="space-y-4 md:space-y-6 px-4 md:px-0">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
            Dashboard
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            Welcome to your Tradezone chatbot analytics dashboard
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="rounded-md border p-0.5 mr-0 sm:mr-2">
            <Button
              variant={period === "week" ? "default" : "ghost"}
              size="sm"
              onClick={() => setPeriod("week")}
            >
              Week
            </Button>
            <Button
              variant={period === "month" ? "default" : "ghost"}
              size="sm"
              onClick={() => setPeriod("month")}
            >
              Month
            </Button>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 flex-1 sm:flex-initial"
            >
              <RefreshCw
                className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
              />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Link href="/dashboard/logs" className="flex-1 sm:flex-initial">
              <Button size="sm" className="flex items-center gap-2 w-full">
                <MessageSquare className="h-4 w-4" />
                <span className="hidden sm:inline">View Logs</span>
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Search Console + Google Analytics side-by-side */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className="overflow-hidden">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="min-w-0">
                <CardTitle className="text-base sm:text-lg">
                  Search Console
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  Clicks & Impressions — last {trafficDays} days vs previous{" "}
                  {trafficDays} days
                </CardDescription>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {[7, 28, 90].map((d) => (
                  <button
                    key={d}
                    onClick={() => setTrafficDays(d as 7 | 28 | 90)}
                    className={`rounded-md px-2 py-1 text-xs border whitespace-nowrap ${
                      trafficDays === d
                        ? "bg-purple-600 text-white border-purple-600"
                        : "bg-transparent hover:bg-muted/50"
                    }`}
                  >
                    {d === 90 ? "3mo" : `${d}d`}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {(() => {
              const cNow = scTraffic.reduce((s, x) => s + (x.clicks || 0), 0);
              const cPrev = scTraffic.reduce(
                (s, x) => s + (x.prevClicks || 0),
                0,
              );
              const iNow = scTraffic.reduce(
                (s, x) => s + (x.impressions || 0),
                0,
              );
              const iPrev = scTraffic.reduce(
                (s, x) => s + (x.prevImpressions || 0),
                0,
              );
              return (
                <div className="mb-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 text-xs">
                  <span className="rounded-md bg-muted px-2 py-1 text-center">
                    Clicks: {cNow.toLocaleString()} vs {cPrev.toLocaleString()}
                  </span>
                  <span className="rounded-md bg-muted px-2 py-1 text-center">
                    Impr.: {iNow.toLocaleString()} vs {iPrev.toLocaleString()}
                  </span>
                </div>
              );
            })()}
            <div className="h-48 sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={scTraffic.length ? scTraffic : []}
                  margin={{ left: 4, right: 4, top: 8, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="clicks"
                    name="Clicks (Current)"
                    stroke="#2563eb"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="prevClicks"
                    name="Clicks (Prev)"
                    stroke="#2563eb"
                    strokeWidth={2}
                    dot={false}
                    strokeDasharray="4 4"
                  />
                  <Line
                    type="monotone"
                    dataKey="impressions"
                    name="Impressions (Current)"
                    stroke="#7c3aed"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="prevImpressions"
                    name="Impressions (Prev)"
                    stroke="#7c3aed"
                    strokeWidth={2}
                    dot={false}
                    strokeDasharray="4 4"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Website Traffic (GA) comparative chart */}
        <Card className="overflow-hidden">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="min-w-0">
                <CardTitle className="text-base sm:text-lg">
                  Website Traffic
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  New Users — last {trafficDays} days vs previous {trafficDays}{" "}
                  days
                </CardDescription>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {[7, 28, 90].map((d) => (
                  <button
                    key={d}
                    onClick={() => setTrafficDays(d as 7 | 28 | 90)}
                    className={`rounded-md px-2 py-1 text-xs border whitespace-nowrap ${
                      trafficDays === d
                        ? "bg-purple-600 text-white border-purple-600"
                        : "bg-transparent hover:bg-muted/50"
                    }`}
                  >
                    {d === 90 ? "3mo" : `${d}d`}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {gaTraffic.length === 0 ? (
              <div className="mb-3 rounded-md border border-yellow-300 bg-yellow-50/70 px-3 py-2 text-xs text-yellow-900">
                No GA data returned. Check GA_PROPERTY, service account
                permissions, and that the property has data.
              </div>
            ) : (
              (() => {
                const currTotal = gaTraffic.reduce(
                  (s, x) => s + (x.current || 0),
                  0,
                );
                const prevTotal = gaTraffic.reduce(
                  (s, x) => s + (x.previous || 0),
                  0,
                );
                const currAvg = trafficDays
                  ? Math.round(currTotal / trafficDays)
                  : 0;
                const prevAvg = trafficDays
                  ? Math.round(prevTotal / trafficDays)
                  : 0;
                return (
                  <div className="mb-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 text-xs">
                    <span className="rounded-md bg-muted px-2 py-1 text-center">
                      Current: {currTotal.toLocaleString()}
                    </span>
                    <span className="rounded-md bg-muted px-2 py-1 text-center">
                      Prev: {prevTotal.toLocaleString()}
                    </span>
                    <span className="rounded-md bg-muted px-2 py-1 text-center">
                      Avg/day: {currAvg} vs {prevAvg}
                    </span>
                  </div>
                );
              })()
            )}
            {(() => {
              const currTotal = gaTraffic.reduce(
                (s, x) => s + (x.current || 0),
                0,
              );
              const prevTotal = gaTraffic.reduce(
                (s, x) => s + (x.previous || 0),
                0,
              );
              if (gaTraffic.length && (currTotal === 0 || prevTotal === 0)) {
                return (
                  <div className="mb-3 rounded-md border border-yellow-300 bg-yellow-50/70 px-3 py-2 text-xs text-yellow-900">
                    Traffic shows 0 for one period. If unexpected, verify GA
                    property access, metric and date range.
                  </div>
                );
              }
              return null;
            })()}
            <div className="h-48 sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={gaTraffic}
                  margin={{ left: 4, right: 4, top: 8, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="current"
                    name="Current"
                    stroke="#6366f1"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="previous"
                    name="Previous"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={false}
                    strokeDasharray="4 4"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* High-level KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card
              key={card.title}
              className="hover:shadow-md transition-shadow"
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {card.title}
                </CardTitle>
                <Icon className={`h-4 w-4 ${card.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{card.value}</div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {card.description}
                  </p>
                  <span
                    className={`text-xs font-medium ${
                      card.trend.startsWith("+")
                        ? "text-green-600"
                        : card.trend.startsWith("-") &&
                            !card.title.includes("Error")
                          ? "text-red-600"
                          : card.trend.startsWith("-") &&
                              card.title.includes("Error")
                            ? "text-green-600"
                            : "text-gray-600"
                    }`}
                  >
                    {card.trend}
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Comparative trend chart */}
      <Card>
        <CardHeader>
          <CardTitle>Conversations Trend</CardTitle>
          <CardDescription>
            {period === "week"
              ? "Last 7 days vs previous 7 days"
              : "Last 30 days vs previous 30 days"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-48 sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ left: 4, right: 4, top: 8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="current"
                  name="Current"
                  stroke="#a78bfa"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="previous"
                  name="Previous"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={false}
                  strokeDasharray="4 4"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Form Submissions Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-purple-400" />
              Form Submissions Overview
            </CardTitle>
            <CardDescription>
              Summary of contact and trade-in forms
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-4 rounded-lg bg-blue-50 dark:bg-blue-950/30">
                <Mail className="h-6 w-6 text-blue-500 mx-auto mb-2" />
                <div className="text-2xl font-bold text-blue-600">
                  {stats.contactForms}
                </div>
                <div className="text-sm text-blue-700 dark:text-blue-400">
                  Contact Forms
                </div>
              </div>
              <div className="text-center p-4 rounded-lg bg-green-50 dark:bg-green-950/30">
                <PhoneCall className="h-6 w-6 text-green-500 mx-auto mb-2" />
                <div className="text-2xl font-bold text-green-600">
                  {stats.tradeInForms}
                </div>
                <div className="text-sm text-green-700 dark:text-green-400">
                  Trade-in Forms
                </div>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t flex items-center justify-between">
              <div>
                <div className="text-sm text-muted-foreground">
                  Pending Review
                </div>
                <div className="text-lg font-semibold text-orange-600">
                  {stats.pendingSubmissions}
                </div>
              </div>
              <Link href="/dashboard/submissions">
                <Button size="sm" variant="default">
                  Manage
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle>Recent Submissions Activity</CardTitle>
            <CardDescription>Latest form submission trends</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <span className="text-sm">Today’s Submissions</span>
                <span className="font-semibold text-primary">
                  {stats.todaySubmissions}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <span className="text-sm">Total This Month</span>
                <span className="font-semibold text-primary">
                  {stats.totalSubmissions}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <span className="text-sm">Response Rate</span>
                <span className="font-semibold text-green-600">
                  {stats.totalSubmissions > 0
                    ? Math.round(
                        ((stats.totalSubmissions - stats.pendingSubmissions) /
                          stats.totalSubmissions) *
                          100,
                      )
                    : 0}
                  %
                </span>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t flex justify-end">
              <Link href="/dashboard/submissions">
                <Button size="sm" variant="outline">
                  View Analytics
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Highlights: keep each page birdview entry points */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle>AI Analytics</CardTitle>
            <CardDescription>Insights from chat data</CardDescription>
          </CardHeader>
          <CardContent className="flex items-end justify-between">
            <div>
              <div className="text-3xl font-bold">{stats.successRate}%</div>
              <div className="text-xs text-muted-foreground">
                Success rate today
              </div>
            </div>
            <Link href="/dashboard/analytics">
              <Button size="sm" variant="default">
                Open
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle>WooCommerce</CardTitle>
            <CardDescription>Store performance snapshot</CardDescription>
          </CardHeader>
          <CardContent className="flex items-end justify-between">
            <div>
              <div className="text-3xl font-bold">{stats.todayChats}</div>
              <div className="text-xs text-muted-foreground">
                Orders/Chats today (proxy)
              </div>
            </div>
            <Link href="/dashboard/woocommerce">
              <Button size="sm" variant="default">
                Open
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle>Google Analytics</CardTitle>
            <CardDescription>Web & search performance</CardDescription>
          </CardHeader>
          <CardContent className="flex items-end justify-between">
            <div>
              <div className="text-3xl font-bold">—</div>
              <div className="text-xs text-muted-foreground">
                Open for full details
              </div>
            </div>
            <Link href="/dashboard/google-analytics">
              <Button size="sm" variant="default">
                Open
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Top summaries section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle>Top Products</CardTitle>
            <CardDescription>From latest WooCommerce snapshot</CardDescription>
          </CardHeader>
          <CardContent>
            {wcTopProducts.length > 0 ? (
              <div className="space-y-3">
                {wcTopProducts.map((p, i) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-md border p-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 text-xs rounded-full bg-secondary flex items-center justify-center">
                        {i + 1}
                      </div>
                      <div>
                        <div className="text-sm font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {p.total_sales} sold • Stock {p.stock_quantity ?? "—"}
                        </div>
                      </div>
                    </div>
                    <div className="text-sm">S${p.price.toFixed(2)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                No WooCommerce snapshot yet
              </div>
            )}
            <div className="mt-3 flex justify-end">
              <Link href="/dashboard/woocommerce">
                <Button size="sm" variant="default">
                  Open
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle>Top Pages</CardTitle>
            <CardDescription>From Google Analytics</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {gaTopPages.slice(0, 5).map((p, i) => (
                <div
                  key={p.page}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    <div className="w-6 h-6 text-xs rounded-full bg-secondary flex items-center justify-center shrink-0">
                      {i + 1}
                    </div>
                    <div
                      className="text-sm truncate max-w-[150px] sm:max-w-[220px]"
                      title={p.page}
                    >
                      {p.page}
                    </div>
                  </div>
                  <div className="text-sm font-medium">
                    {p.views.toLocaleString()} views
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex justify-end">
              <Link href="/dashboard/google-analytics">
                <Button size="sm" variant="default">
                  Open
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle>Top Devices</CardTitle>
            <CardDescription>From Google Analytics</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {gaDevices.map((d) => (
                <div
                  key={d.name}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div className="text-sm font-medium">{d.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {d.value}%
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex justify-end">
              <Link href="/dashboard/google-analytics">
                <Button size="sm" variant="default">
                  Open
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
