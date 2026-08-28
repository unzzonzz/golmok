import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  /**
   * GitHub Pages 프로젝트 페이지는 https://unzzonzz.github.io/golmok/ 아래로 서빙된다.
   * base 를 주지 않으면 번들이 /assets/... 를 요청해서 전부 404 난다.
   * dev 서버는 루트로 두어야 localhost:5173 이 그대로 열린다.
   */
  base: command === 'build' ? '/golmok/' : '/',
}));
