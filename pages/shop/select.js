const WXAPI = require('apifm-wxapi')
const APP = getApp()

Page({

  /**
   * 页面的初始数据
   */
  data: {

  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {

  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady: function () {

  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {
    this.fetchShops('', '', '')
  },
  async fetchShops(latitude, longitude, kw){
    const params = {
      nameLike: kw
    }
    if (latitude && longitude) {
      params.curlatitude = latitude
      params.curlongitude = longitude
    }
    const res = await WXAPI.fetchShops(params)
    if (res.code == 0) {
      res.data.forEach(ele => {
        if (ele.distance !== undefined && ele.distance !== null) {
          ele.distance = ele.distance.toFixed(3) // 距离保留3位小数
        }
      })
      this.setData({
        shops: res.data
      })
    } else {
      this.setData({
        shops: null
      })
    }
  },
  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide: function () {

  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload: function () {

  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh: function () {

  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom: function () {

  },
  searchChange(event){
    this.setData({
      searchValue: event.detail.value
    })
  },
  search(event){
    console.log('search')
    this.setData({
      searchValue: event.detail.value
    })
    this.fetchShops(this.data.latitude, this.data.longitude, event.detail.value)
  },
  goShop(e){
    const idx = e.currentTarget.dataset.idx
    wx.setStorageSync('shopInfo', this.data.shops[idx])
    wx.setStorageSync('shopIds', this.data.shops[idx].id)
    wx.setStorageSync('refreshIndex', 1)
    wx.switchTab({
      url: '/pages/index/index'
    })
  }
})
