import { describe, expect, test } from "bun:test";
import { buildBrowserNoticeScript, isInAppBrowser, noticePlatform, recommendedBrowsers } from "../src/lib/browser/browser-notice";

const userAgents = {
  wechatAndroid: "Mozilla/5.0 (Linux; Android 12; V2049A Build/SP1A.210812.003; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/86.0.4240.99 XWEB/4317 MMWEBSDK/20220903 Mobile Safari/537.36 MMWEBID/6294 MicroMessenger/8.0.28.2240(0x28001C35) WeChat/arm64 Weixin NetType/WIFI Language/zh_CN ABI/arm64",
  qqAndroid: "Mozilla/5.0 (Linux; Android 10; PCT-AL10 Build/HUAWEIPCT-AL10; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/89.0.4389.72 MQQBrowser/6.2 TBS/046011 Mobile Safari/537.36 V1_AND_SQ_8.8.50_2324_YYB_D A_8085000 QQ/8.8.50.6735 NetType/WIFI WebP/0.3.0 Pixel/1080",
  qqIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 QQ/8.9.20.614 V1_IPH_SQ_8.9.20_1_APP_A Pixel/1170 MiniAppEnable SimpleUISwitch/0 StudyMode/0 CurrentMode/0 CurrentFontScale/1.000000 QQTheme/1000 Core/WKWebView Device/Apple(iPhone 13) NetType/WIFI QBWebViewType/1 WKType/1",
  douyin: "Mozilla/5.0 (Linux; Android 11; M2012K11AC Build/RKQ1.200826.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/90.0.4430.91 Mobile Safari/537.36 aweme_230400 JsSdk/1.0 NetType/WIFI Channel/xiaomi_1128_64 app_version/23.4.0 ByteLocale/zh-CN",
  androidWebView: "Mozilla/5.0 (Linux; Android 13; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.230 Mobile Safari/537.36",
  chromeAndroid: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36",
  chromeDesktop: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  edgeDesktop: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0",
  safariIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  kakaoAndroid: "Mozilla/5.0 (Linux; Android 13; SM-S911N Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/119.0.6045.163 Mobile Safari/537.36;KAKAOTALK 2410420",
  ipadDesktop: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  harmonyNext: "Mozilla/5.0 (Phone; OpenHarmony 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36 ArkWeb/4.1.6.1 Mobile",
  qqBrowser: "Mozilla/5.0 (Linux; U; Android 12; zh-cn; 22041211AC Build/SP1A.210812.016) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/109.0.5414.86 MQQBrowser/14.3 Mobile Safari/537.36",
};

describe("browser notice detection", () => {
  test("apps' built-in browsers are recognised", () => {
    for (const ua of [userAgents.wechatAndroid, userAgents.qqAndroid, userAgents.qqIos, userAgents.douyin, userAgents.kakaoAndroid, userAgents.androidWebView]) {
      expect(isInAppBrowser(ua)).toBe(true);
    }
  });
  test("standalone browsers are left to the CSS feature test", () => {
    for (const ua of [userAgents.chromeAndroid, userAgents.chromeDesktop, userAgents.edgeDesktop, userAgents.safariIos, userAgents.qqBrowser]) {
      expect(isInAppBrowser(ua)).toBe(false);
    }
  });
  test("platforms decide the advice: iOS updates, Android and desktop get links", () => {
    expect(noticePlatform(userAgents.qqIos, 5)).toBe("ios");
    expect(noticePlatform(userAgents.safariIos, 5)).toBe("ios");
    expect(noticePlatform(userAgents.ipadDesktop, 5)).toBe("ios");
    expect(noticePlatform(userAgents.ipadDesktop, 0)).toBe("desktop");
    expect(noticePlatform(userAgents.wechatAndroid, 5)).toBe("android");
    expect(noticePlatform(userAgents.qqBrowser, 5)).toBe("android");
    expect(noticePlatform(userAgents.chromeDesktop, 0)).toBe("desktop");
    expect(noticePlatform(userAgents.harmonyNext, 5)).toBe("other");
  });
  test("mainland readers get Lemur on Android and Edge alone on desktop", () => {
    expect(recommendedBrowsers("zh-CN")).toEqual({ android: ["lemur"], desktop: ["edge"] });
    for (const locale of ["zh-TW", "ja-JP", "en-US", "ko-KR"] as const) {
      expect(recommendedBrowsers(locale)).toEqual({ android: ["chrome", "edge"], desktop: ["edge", "chrome"] });
    }
  });
  test("the bootstrap script stays ES5 for old engines", () => {
    const script = buildBrowserNoticeScript({ templateId: "notice", storageKey: "key" });
    expect(() => new Function(script)).not.toThrow();
    expect(script).not.toMatch(/=>|`|\.\.\.|\b(?:let|const|class)\s/);
  });
});
