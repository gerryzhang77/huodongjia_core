import openeventLogo from "@/assets/auth/login/openevent-logo.svg";

/** Figma 登录页左侧品牌区。 */
export const LoginIllustration = () => (
  <section className="openevent-login-hero" aria-label="活动家">
    <img
      src={openeventLogo}
      alt="活动家"
      className="openevent-login-logo"
    />
    <h1 className="openevent-login-heading">
      <span className="openevent-login-heading-cn">欢迎来到</span>
      <span className="openevent-login-heading-cn">活动家</span>
    </h1>
    <p className="openevent-login-tagline">让每一次参与，都创造价值</p>
  </section>
);
