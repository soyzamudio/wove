import type { BlockOf } from "@agentpress/sdk";
import type { RenderContext } from "../context";
import { imgAttrs } from "../image-attrs";
import { Icon } from "../icon";
import { SectionHead, gridClass } from "../ui";

export function Testimonials({ props, ctx }: { props: BlockOf<"testimonials">["props"]; ctx: RenderContext }) {
  const columns = props.items.length >= 3 ? 3 : 2;
  return (
    <div className="ap-in ap-testimonials">
      <SectionHead headline={props.headline} />
      <div className={gridClass(columns)}>
        {props.items.map((t, i) => (
          <figure className="ap-quote" key={i}>
            <span className="ap-quote__mark">
              <Icon name="quote" size={22} />
            </span>
            <blockquote>{t.quote}</blockquote>
            <figcaption className="ap-quote__person">
              {t.avatar?.url ? (
                <img {...imgAttrs(t.avatar, ctx)} alt={t.avatar.alt ?? t.name} loading="lazy" />
              ) : null}
              <span>
                <span className="ap-quote__name">{t.name}</span>
                {t.role ? (
                  <>
                    <br />
                    <span className="ap-quote__role">{t.role}</span>
                  </>
                ) : null}
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
