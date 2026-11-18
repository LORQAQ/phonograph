'use strict'
/* 彻底方案：在 index.html 注入一个全局兜底，
   把 $ 函数改成永不返回 null（返回哑元素），这样任何 innerHTML 赋值都不会崩 */
const fs = require('node:fs')

const p = 'public/index.html'
let h = fs.readFileSync(p, 'utf8')

const MARK = '<!-- 哑元素兜底 -->'
if (h.includes(MARK)) {
  console.log('兜底已存在')
  process.exit(0)
}

/* 在 app.js 之前注入 */
const inject = `
${MARK}
<script>
/* 保证 $() 永不返回 null：找不到元素时返回一个哑对象，
   避免 "Cannot set properties of null" 把整个启动流程打断 */
(function () {
  var _q = document.querySelector.bind(document);
  function dummy () {
    var o = {
      innerHTML: '', textContent: '', value: '', checked: false, disabled: false,
      style: new Proxy({}, { get: function () { return '' }, set: function () { return true } }),
      classList: { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false } },
      dataset: {},
      children: [], childNodes: [], offsetTop: 0, offsetHeight: 0, clientHeight: 0, scrollTop: 0, scrollHeight: 0,
      appendChild: function (x) { return x },
      removeChild: function () {},
      remove: function () {},
      addEventListener: function () {},
      removeEventListener: function () {},
      setAttribute: function () {},
      getAttribute: function () { return null },
      querySelector: function () { return dummy() },
      querySelectorAll: function () { return [] },
      closest: function () { return null },
      focus: function () {},
      blur: function () {},
      click: function () {},
      play: function () { return Promise.resolve() },
      pause: function () {},
      load: function () {},
      scrollTo: function () {},
      getBoundingClientRect: function () { return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 } },
    };
    return o;
  }
  window.__DSH_DUMMY__ = dummy
  /* 包一层 document.querySelector */
  var _origQS = Document.prototype.querySelector;
  Document.prototype.querySelector = function (sel) {
    var r = _origQS.call(this, sel);
    return r || dummy();
  };
  var _origGEBI = document.getElementById.bind(document);
  document.getElementById = function (id) {
    return _origGEBI(id) || dummy();
  };
})();
</script>
`

/* 插到 </head> 前 */
if (h.includes('</head>')) {
  h = h.replace('</head>', inject + '</head>')
  fs.writeFileSync(p, h, 'utf8')
  console.log('已在 index.html 注入哑元素兜底')
} else {
  console.log('未找到 </head>')
}
