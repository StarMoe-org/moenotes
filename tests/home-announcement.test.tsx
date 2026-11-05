import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import HomeAnnouncement from "@/components/home/HomeAnnouncement";
import { siteConfig } from "@/config/site";

const CORE_LOCALES = ["zh-CN", "zh-TW", "ja-JP", "en-US", "ko-KR"] as const;

describe("HomeAnnouncement maintainer recruitment banner", () => {
  test("renders across all 5 core locales with StarMoe/Moenotes details, Google #1 standing, perks, and valid mailto link", () => {
    for (const locale of CORE_LOCALES) {
      const html = renderToStaticMarkup(<HomeAnnouncement locale={locale} />);
      expect(html).not.toContain("home.announcement.");
      expect(html).toContain(siteConfig.author);
      expect(html).toContain(siteConfig.name);
      expect(html).toContain("ournotes viewer");
      expect(html).toContain("bdon.moe");
      expect(html).toContain(siteConfig.contact.email);
      expect(html).toContain(`href="mailto:${siteConfig.contact.email}?subject=`);
    }

    const zhHtml = renderToStaticMarkup(<HomeAnnouncement locale="zh-CN" />);
    expect(zhHtml).toContain("StarMoe 诚招 Moenotes 新任站长与维护者");
    expect(zhHtml).toContain("服务器与托管资源");
    expect(zhHtml).toContain("自动化数据与构建工作流");
    expect(zhHtml).toContain("现有域名（bdon.moe）");
    expect(zhHtml).toContain("交接期必要的技术与架构指导");
    expect(zhHtml).toContain("哪怕你只会使用 AI 工具");
    expect(zhHtml).toContain("长期有效（在招到之前）");
    expect(zhHtml).toContain("mail@exmeaning.com");
  });
});
