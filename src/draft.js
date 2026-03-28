'use strict';

const https = require('https');

const DRAFT_ADD_URL = 'https://api.weixin.qq.com/cgi-bin/draft/add';
const REQUEST_TIMEOUT_MS = 10 * 1000;

const VALID_ARTICLE_TYPES = new Set(['news', 'newspic']);

/**
 * 校验单篇文章字段，违规返回错误描述字符串，合法返回 null。
 */
function validateArticle(a, idx) {
  const p = `articles[${idx}]`;

  // article_type
  if (a.article_type !== undefined && !VALID_ARTICLE_TYPES.has(a.article_type)) {
    return `${p}.article_type 须为 "news" 或 "newspic"`;
  }
  const type = a.article_type || 'news';

  // title：必填，超过 64 字自动截断
  if (!a.title) return `${p}.title 必填`;
  if (typeof a.title !== 'string') return `${p}.title 须为字符串`;
  if (a.title.length > 64) a.title = a.title.slice(0, 64);

  // author：选填，最多 16 字
  if (a.author !== undefined) {
    if (typeof a.author !== 'string') return `${p}.author 须为字符串`;
    if (a.author.length > 16) return `${p}.author 最多 16 字，当前 ${a.author.length} 字`;
  }

  // digest：选填，最多 128 字
  if (a.digest !== undefined) {
    if (typeof a.digest !== 'string') return `${p}.digest 须为字符串`;
    if (a.digest.length > 128) return `${p}.digest 最多 128 字，当前 ${a.digest.length} 字`;
  }

  // content：必填
  if (!a.content) return `${p}.content 必填`;
  if (typeof a.content !== 'string') return `${p}.content 须为字符串`;

  // content_source_url：选填
  if (a.content_source_url !== undefined && typeof a.content_source_url !== 'string') {
    return `${p}.content_source_url 须为字符串`;
  }

  // thumb_media_id：news 类型必填
  if (type === 'news') {
    if (!a.thumb_media_id) return `${p}.thumb_media_id 在 news 类型中必填`;
    if (typeof a.thumb_media_id !== 'string') return `${p}.thumb_media_id 须为字符串`;
  }

  // image_info：newspic 类型必填，最多 20 张
  if (type === 'newspic') {
    if (!a.image_info) return `${p}.image_info 在 newspic 类型中必填`;
    if (!Array.isArray(a.image_info.list)) return `${p}.image_info.list 须为数组`;
    if (a.image_info.list.length === 0) return `${p}.image_info.list 不能为空`;
    if (a.image_info.list.length > 20) return `${p}.image_info.list 最多 20 张，当前 ${a.image_info.list.length} 张`;
  }

  // need_open_comment：选填，0 或 1
  if (a.need_open_comment !== undefined) {
    if (a.need_open_comment !== 0 && a.need_open_comment !== 1) {
      return `${p}.need_open_comment 须为 0 或 1`;
    }
  }

  // only_fans_can_comment：选填，0 或 1
  if (a.only_fans_can_comment !== undefined) {
    if (a.only_fans_can_comment !== 0 && a.only_fans_can_comment !== 1) {
      return `${p}.only_fans_can_comment 须为 0 或 1`;
    }
  }

  // pic_crop_235_1：选填，字符串，封面裁剪坐标 2.35:1
  if (a.pic_crop_235_1 !== undefined && typeof a.pic_crop_235_1 !== 'string') {
    return `${p}.pic_crop_235_1 须为字符串`;
  }

  // pic_crop_1_1：选填，字符串，封面裁剪坐标 1:1
  if (a.pic_crop_1_1 !== undefined && typeof a.pic_crop_1_1 !== 'string') {
    return `${p}.pic_crop_1_1 须为字符串`;
  }

  // cover_info：选填，对象
  if (a.cover_info !== undefined && (typeof a.cover_info !== 'object' || Array.isArray(a.cover_info))) {
    return `${p}.cover_info 须为对象`;
  }

  // product_info：选填，对象
  if (a.product_info !== undefined && (typeof a.product_info !== 'object' || Array.isArray(a.product_info))) {
    return `${p}.product_info 须为对象`;
  }

  return null;
}

/**
 * 新增草稿，返回 media_id。
 * @param {string} accessToken
 * @param {Array<object>} articles
 */
function addDraft(accessToken, articles) {
  if (!Array.isArray(articles) || articles.length === 0) {
    return Promise.reject(new Error('articles 不能为空'));
  }

  for (let i = 0; i < articles.length; i++) {
    const err = validateArticle(articles[i], i);
    if (err) return Promise.reject(new Error(err));
  }

  const body = JSON.stringify({ articles });

  return new Promise((resolve, reject) => {
    const req = https.request(
      `${DRAFT_ADD_URL}?access_token=${accessToken}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          let result;
          try {
            result = JSON.parse(raw);
          } catch {
            return reject(new Error(`微信接口响应解析失败: ${raw}`));
          }
          if (result.errcode) {
            return reject(new Error(`新增草稿失败 [${result.errcode}]: ${result.errmsg}`));
          }
          resolve(result.media_id);
        });
      }
    );
    req.setTimeout(REQUEST_TIMEOUT_MS, () => req.destroy(new Error('新增草稿请求超时')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = { addDraft };
