/**
 * 第三方分析统计配置。
 *
 * 当 `googleAnalytics.measurementId` 为空字符串时，对应的脚本不会注入到页面中，
 * 因此可通过修改此处的值来启用 / 禁用分析统计，而无需改动布局代码。
 */
export interface AnalyticsConfig {
  googleAnalytics: {
    /** 是否启用 Google Analytics 注入。设为 false 时不加载任何 GA 脚本。 */
    enabled: boolean;
    /** Google Analytics 4 的衡量 ID，形如 `G-XXXXXXXXXX`。 */
    measurementId: string;
    /** gtag.js 脚本地址，可用 `{id}` 占位符替换为衡量 ID。 */
    scriptSrc: string;
    /** 预连接域名，用于提升脚本加载性能。 */
    domains: string[];
  };
}

export const analyticsConfig: AnalyticsConfig = {
  googleAnalytics: {
    enabled: true,
    measurementId: "G-1KSK0PTHDS",
    scriptSrc: "https://www.googletagmanager.com/gtag/js?id={id}",
    domains: [
      "https://www.googletagmanager.com",
      "https://www.gstatic.com",
    ],
  },
};

/** 是否启用 Google Analytics（便捷判断）。 */
export const isGoogleAnalyticsEnabled =
  analyticsConfig.googleAnalytics.enabled && analyticsConfig.googleAnalytics.measurementId.length > 0;

/** 解析后的 gtag.js 脚本地址。 */
export const googleAnalyticsScriptSrc = analyticsConfig.googleAnalytics.scriptSrc.replace(
  "{id}",
  analyticsConfig.googleAnalytics.measurementId,
);
