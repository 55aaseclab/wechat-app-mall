const WXAPI = require('apifm-wxapi')
const TOOLS = require('../../utils/tools.js')
const dayjs = require("dayjs")

Page({
  data: {
    name: '',
    page: 1,
    pageSize: 20,
    noMore: false,
    loaded: false,           // 首次加载完成标志，防止空状态闪烁
    categoryIndex: -1,
    dayArray: ['全部', '一周内', '一月内', '半年内', '一年内'],
    dayIndex: -1,
    goods: null,
    skuCurGoods: undefined,  // 传给 goods-pop，触发 SKU 弹窗
    totalCartNum: 0,         // 购物车总数，用于浮动按钮红点
  },

  onLoad: function (options) {
    this.setData({
      name: options.name,
      categoryId: options.categoryId
    })
    this.search()
    this.categories()
  },

  onShow: function () {
    this.refreshCartNum()
    if (this.data.loaded) {
      this._paidGoodsIds = null
      this.setData({ page: 1, noMore: false })
      this.search()
    }
  },

  // 购买历史接口没有可靠的订单支付状态，使用订单列表核对已付款商品。
  async loadPaidGoodsIds() {
    if (this._paidGoodsIds) return this._paidGoodsIds
    if (this._paidGoodsIdsPromise) return this._paidGoodsIdsPromise

    const token = wx.getStorageSync('token')
    if (!token) return new Set()

    this._paidGoodsIdsPromise = (async () => {
      const paidGoodsIds = new Set()
      const pageSize = 50
      let page = 1

      while (true) {
        const res = await WXAPI.orderList({ token, page, pageSize })
        if (res.code != 0 || !res.data || !Array.isArray(res.data.orderList)) {
          return null
        }

        const goodsMap = res.data.goodsMap || {}
        res.data.orderList.forEach(order => {
          // -1=已关闭，0=待支付，1~4=已付款订单状态。
          const status = Number(order.status)
          if (!Number.isFinite(status) || status < 1) return
          const goodsList = goodsMap[order.id]
          if (!Array.isArray(goodsList)) return
          goodsList.forEach(goods => {
            const goodsId = goods.goodsId || goods.id
            if (goodsId !== undefined && goodsId !== null && goodsId !== '') {
              paidGoodsIds.add(String(goodsId))
            }
          })
        })

        const totalPage = Number(res.data.totalPage)
        if (res.data.orderList.length < pageSize || (totalPage > 0 && page >= totalPage)) {
          break
        }
        page += 1
      }

      return paidGoodsIds
    })()

    try {
      this._paidGoodsIds = await this._paidGoodsIdsPromise
      return this._paidGoodsIds
    } catch (error) {
      this._paidGoodsIds = null
      return null
    } finally {
      this._paidGoodsIdsPromise = null
    }
  },

  // ==================== 搜索 / 筛选 ====================

  search2(e) {
    this.setData({ page: 1, noMore: false, name: e.detail })
    this.search()
  },
  search3() {
    this.setData({ page: 1, noMore: false, name: '' })
    this.search()
  },

  async search() {
    wx.showLoading({ title: '' })
    const paidGoodsIds = await this.loadPaidGoodsIds()
    if (!paidGoodsIds) {
      wx.hideLoading()
      this.setData({ goods: null, loaded: true, noMore: true })
      wx.showToast({ title: '购买记录加载失败', icon: 'none' })
      return
    }

    const startPage = this.data.page
    let requestPage = startPage
    let newList = []
    let lastRawCount = 0
    let res

    // 未付款记录被过滤后继续读取后续页，避免第一页空白就误判为没有购买记录。
    do {
      res = await WXAPI.myBuyGoodsHisV2({
        page: requestPage,
        pageSize: this.data.pageSize,
        nameLike: this.data.name || '',
        dateBuyBegin: this.data.dateBuyBegin || '',
        dateBuyEnd: this.data.dateBuyEnd || '',
        categoryId: this.data.categoryId || '',
        token: wx.getStorageSync('token'),
      })
      if (res.code != 0) break

      const rawList = (res.data && res.data.result) || []
      lastRawCount = rawList.length
      newList = newList.concat(rawList.filter(item => paidGoodsIds.has(String(item.goodsId))))

      if (rawList.length < this.data.pageSize || newList.length >= this.data.pageSize) break
      requestPage += 1
    } while (true)

    wx.hideLoading()
    if (res.code == 0) {
      newList.forEach(ele => { ele.cartNum = 0 })
      const merged = startPage === 1
        ? newList
        : (this.data.goods || []).concat(newList)
      this.setData({
        goods: merged,
        loaded: true,
        page: requestPage,
        noMore: lastRawCount < this.data.pageSize,
      })
      this.refreshCartNum()
    } else {
      if (startPage === 1) {
        this.setData({ goods: null, loaded: true })
      } else {
        this.setData({ noMore: true })
        wx.showToast({ title: '没有更多了', icon: 'none' })
      }
    }
  },

  onReachBottom() {
    if (this.data.noMore) return
    this.setData({ page: this.data.page + 1 })
    this.search()
  },

  // ==================== 分类 / 时间筛选 ====================

  async categories() {
    const res = await WXAPI.goodsCategory()
    if (res.code == 0) {
      const categories = res.data
      categories.forEach(p => {
        p.childs = categories.filter(ele => p.id == ele.pid)
      })
      this.setData({
        categories: [{ id: 0, name: '全部' }].concat(res.data.filter(ele => ele.level == 1))
      })
    }
  },

  categoryChange(e) {
    this.setData({
      categoryIndex: e.detail.value,
      categoryId: this.data.categories[e.detail.value].id,
      page: 1,
      noMore: false,
    })
    this.search()
  },

  dayChange(e) {
    const dayIndex = e.detail.value
    let dateBuyBegin = ''
    if (dayIndex == 1) dateBuyBegin = dayjs().subtract(7, 'day').format('YYYY-MM-DD')
    if (dayIndex == 2) dateBuyBegin = dayjs().subtract(1, 'month').format('YYYY-MM-DD')
    if (dayIndex == 3) dateBuyBegin = dayjs().subtract(6, 'month').format('YYYY-MM-DD')
    if (dayIndex == 4) dateBuyBegin = dayjs().subtract(1, 'year').format('YYYY-MM-DD')
    this.setData({ dayIndex, dateBuyBegin, page: 1, noMore: false })
    this.search()
  },

  // ==================== 加入购物车 ====================

  async addShopCar(e) {
    const idx = e.currentTarget.dataset.idx
    const item = this.data.goods[idx]
    if (!item) return

    const token = wx.getStorageSync('token')
    if (!token) {
      wx.navigateTo({ url: '/pages/login/index' })
      return
    }

    // 先查商品详情，获取完整 SKU / 可选配件 / 库存信息
    wx.showLoading({ title: '加载中' })
    const detailRes = await WXAPI.goodsDetailV2({ id: item.goodsId, token })
    wx.hideLoading()

    if (detailRes.code != 0) {
      wx.showToast({ title: detailRes.msg || '商品信息获取失败', icon: 'none' })
      return
    }

    const detail = detailRes.data
    const basicInfo = detail.basicInfo

    if (basicInfo.stores <= 0) {
      wx.showToast({ title: '已售罄~', icon: 'none' })
      return
    }

    const hasProperties = detail.properties && detail.properties.length > 0
    const hasAddition = basicInfo.hasAddition

    if (hasProperties || hasAddition) {
      this.setData({
        skuCurGoods: {
          id: item.goodsId,
          stores: basicInfo.stores,
          hasAddition: hasAddition,
        }
      })
      return
    }

    // 无规格无配件，直接加购
    const res = await WXAPI.shippingCarInfoAddItem(token, item.goodsId, 1, [])
    if (res.code == 2000) {
      wx.navigateTo({ url: '/pages/login/index' })
      return
    }
    if (res.code == 30002) {
      this.setData({
        skuCurGoods: {
          id: item.goodsId,
          stores: basicInfo.stores,
          hasAddition: hasAddition,
        }
      })
    } else if (res.code == 0) {
      wx.showToast({ title: '加入成功', icon: 'success' })
      this.refreshCartNum()
      TOOLS.showTabBarBadge()
    } else {
      wx.showToast({ title: res.msg, icon: 'none' })
    }
  },

  // goods-pop 组件加购成功回调
  onAddCartSuccess() {
    this.refreshCartNum()
  },

  // ==================== 购物车数量刷新 ====================

  async refreshCartNum() {
    const token = wx.getStorageSync('token')
    if (!token) return

    const totalCartNum = await TOOLS.showTabBarBadge(true)
    this.setData({ totalCartNum })

    const cartRes = await WXAPI.shippingCarInfo(token)
    if (cartRes.code != 0 || !cartRes.data || !cartRes.data.items) return

    const cartList = cartRes.data.items
    const goods = this.data.goods
    if (!goods || goods.length == 0) return

    const cartMap = {}
    cartList.forEach(cartItem => {
      const gid = cartItem.goodsId || cartItem.id
      if (!gid) return
      cartMap[gid] = (cartMap[gid] || 0) + (cartItem.number || 1)
    })

    let changed = false
    goods.forEach((item, i) => {
      const num = cartMap[item.goodsId] || 0
      if (item.cartNum !== num) {
        goods[i] = Object.assign({}, item, { cartNum: num })
        changed = true
      }
    })
    if (changed) this.setData({ goods })
  },

  // ==================== 跳转购物车 ====================

  goToCart() {
    wx.switchTab({ url: '/pages/shop-cart/index' })
  },
})
