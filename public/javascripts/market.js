var FarmersMarketFinder = function () {
  var _map = null,
      _markets = null,
      _mobile = false,
      _markers = null,
      _displayForDate = null,
      _center = null;

  function isMobile() {
    return _map == null || _mobile;
  }

  function hideFlash() {
    $("#flashMsg").css("display", "none");
  }

  function flash(msg, type) {
    $("#flashMsg").css("display", "block").html(msg);
  }

  function refreshViewData() {
    updateDistanceFromCurrentLocation();
    if (!isMobile()) {
      updateMap();
    }
    updateMarketLists();
    displayWarningIfMarkersNotVisible();
  }

  function setCookie(name, value, days) {
    var expires;
    if (days) {
      var date = new Date();
      date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
      expires = "; expires=" + date.toGMTString();
    }
    else expires = "";
    document.cookie = name + "=" + value + expires + "; path=/";
  }

  function findLocation() {
    return _center;
  }

  function getCookie(name) {
    var nameEQ = name + "=";
    var ca = document.cookie.split(';');
    for (var i = 0; i < ca.length; i++) {
      var c = ca[i];
      while (c.charAt(0) == ' ') c = c.substring(1, c.length);
      if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
  }

  var Markers = function () {
    var markers = {}, lastLetter = 0, color = "";

    function buildIconURL(letter) {
      /*
      var code = letter.charCodeAt(0);
      if (code > 90) {
        code = code - 26;
        color = "_orange"
      }
      letter = String.fromCharCode(code);
      return "http://www.google.com/mapfiles/marker" + color + letter + ".png"
      */
      return "http://www.google.com/mapfiles/marker.png";
    }

    this.clear = function () {
      color = "", lastLetter = 0;
      this.bounds = new google.maps.LatLngBounds();
      $.each(markers, function (key, marker) {
        marker.setMap(null);
      });
      markers = {};
    };

    this.add = function (market) {
      if (markers[market.location.name] == undefined) {
        var letterId = 0;
        market.marker = new google.maps.Marker({
          map: _map,
          icon: buildIconURL(letterId),
          position: market.position
        });
        market.markerId = "marker" + lastLetter;
        markers[market.location.name] = market.marker;
        lastLetter++;
        this.bounds.extend(market.position);
      } else {
        market.marker = markers[market.location.name];
      }
    };
  };

  var Clock = {
    now: function () {
      return new Date().getTime();
    }
  };

  var Markets = function (model) {
    var self = this;
    self.markets = []; ;

    $.each(model["markets"], function(idx, market) {
      market["position"] = new google.maps.LatLng(market["location"].lat, market["location"].lng);
      self.markets.push(market);
    });

    this.all = function () {
      return this.markets;
    };

    this.updateDistanceFrom = function (location) {
      $.each(self.markets, function (idx, market) {
        var distance = google.maps.geometry.spherical.computeDistanceBetween(location,
            market.position, 3959);
        market.distance = Math.round(distance * 100) / 100;
      });
    };

    this.allVisible = function () {
      if (isMobile()) {
        return true;
      }
      var bounds = _map.getBounds(), visible = true;
      $.each(this.markets, function (idx, stop) {
        if (!bounds.contains(stop.position)) {
          visible = false;
        }
      });
      return visible;
    };

    this.hasActive = function() {
      return self.markets.length > 0;
    };

    this.openNow = function () {
      var now = Clock.now(), items = [];
      $.each(self.markets, function (idx, item) {
        if (item["start"] <= now && item["end"] > now && (isMobile() || _map.getBounds().contains(item.position))) {
          items.push(item);
        } 
      });
      return items;
    };

    this.openLater = function () {
      var now = Clock.now(), items = [];
      $.each(self.markets, function (idx, item) {
        try {
          if (item["start"] > now && (isMobile() || ((typeof _map.getBounds() != "undefined") && _map.getBounds().contains(item.position)))) {
            items.push(item);
          }
        } catch (e) {
          console.log("INDEX: " + idx);
          console.log(e);
        }
      });
      return items;
    }
  };

  function formatLocation(location) {
    if (/, Chicago, IL$/i.test(location)) {
      location = location.substring(0, location.length - 13);
    }
    return location;
  }
  
  function buildInfoWindow(market) {
    var contentString = "<div class='infoWindowContent'><h4>" + market.name + "</h4>";
    contentString += "<address>" + market.location.name + "</address>";
    if (market.distance != null) {
      contentString += "<p>(" + market.distance + " miles from your location)</p>"
    }
    if (activeDataSet() == 'allmarkets') {
      contentString += "<p style='padding-top:10px'>" + market.description + "</p>";
    } else {
      contentString += "<p style='padding-top:10px'>" + buildTimeRange(market, Clock.now()) + "</p>";
    }
    contentString = contentString + "</div>";
    var infowindow = new google.maps.InfoWindow({
      content: contentString
    });
    google.maps.event.addListener(market.marker, 'click', function () {
      infowindow.open(_map, market.marker);
    });
  }

  function buildTimeRange(stop, time) {
    if (stop.start < time && stop.end > time) {
      return "Closes at: " + stop.endFormatted;
    } else {
      return "Opens today from " + stop.startFormatted + " to " + stop.endFormatted ;
    }
  }

  function buildMarketList($marketList, markets) {
    $marketList.empty();
    var $items = $("<ul class='media-list'></ul>"), lastIcon = null, now = Clock.now(), $location, $div;
    $items.appendTo($marketList);
    var activeToday = activeDataSet() != 'allmarkets';
    $.each(markets, function (idx, market) {
      var locationName = isMobile() ? "<a href='http://maps.google.com/maps?q=" + market.location.lat + "," + market.location.lng + "'>" + market.location.name + "</a>" : market.location.name;
      var $locationDescription = $("<div><address>" + locationName + "</address></div>");
      if (market.location.url) $locationDescription.append("<div>" + market.location.url + "</a></div>");
      if (market.location.description) $locationDescription.append("<div>" + market.location.description + " </div>");
      if (!isMobile()) {
        if (market.distance) $locationDescription.append("(" + market.distance + " miles from map center)");
        $div = $("<div class='media-body'><h4>" + market.name + "</h4></div>");
        $div.append($locationDescription);
        if (!activeToday) {
          if (market.description) {
            $div.append("<p style='padding-top:10px'>" + market.description + "</p>");
          }
        } else {
          $div.append("<p style='padding-top:10px'>" + buildTimeRange(market, now) + "</p>");
        }
        if (market.url) $div.append("<div><a href='" + market.url+ "'>" + market.url + "</a></div>")
        $location = $("<li class='media'><a class='pull-left' href='#'><img id='" + market.markerId + "' class='media-object' src='"
              + market.marker.icon +"'/></a></li>");
        $location.append($div);
        $items.append($location);
      } else {
        if (market.distance) $locationDescription.append("<div>(" + market.distance + " miles away)</div>");
        $div = $("<div class='media-body'><h4>" + formatLocation(market.name) + "</h4></div>");
        $div.append($locationDescription);
        if (!activeToday) {
          if (market.description) {
            $div.append("<p style='padding-top:10px'>" + market.description + "</p>");
          }
        } else {
          $div.append("<p style='padding-top:10px'>" + buildTimeRange(market, now) + "</p>");
        }
        $location = $("<li class='media'></li>");
        $location.append($div);
        $items.append($location);
      }
    });
    if (!isMobile()) {
      $.each(markets, function (idx, market) {
        if (market.marker.getAnimation() != null) {
          return;
        }
        buildInfoWindow(market);
        $("#" + market.markerId).click(function (e) {
          e.preventDefault();
          market.marker.setAnimation(google.maps.Animation.BOUNCE);
          setTimeout(function () {
            market.marker.setAnimation(null);
          }, 3000);
        });
      });
    }
  }

  function updateMarketLists() {
    var location = findLocation(),
        nowMarkets = sortByDistanceFromLocation(_markets.openNow(), location),
        laterMarkets = sortByDistanceFromLocation(_markets.openLater(), location);
    if (nowMarkets.length == 0 && laterMarkets.length == 0) {
      $(".trucksListHeader").css("display", "none");
      $("#navTabs").css("display", "none");
      $(".marketDL").empty();
    } else {
      $(".trucksListHeader").css("display", "block");
      $("#navTabs").css("display", "block");
      buildMarketList($("#nowMarkets"), nowMarkets);
      buildMarketList($("#laterMarkets"), laterMarkets);
      if (nowMarkets.length == 0) {
        $('a[href="#laterMarkets"]').tab('show');
      }
    }
  }

  function updateDistanceFromCurrentLocation() {
    _markets.updateDistanceFrom(findLocation());
  }

  function sortByDistanceFromLocation(markets, location) {
    return markets.sort(function (a, b) {
      if (typeof a.distance == "undefined" || a.distance == null) {
        return 0;
      }
      return a.distance > b.distance ? 1 : ((a.distance == b.distance) ? 0 : -1);
    });
  }

  function updateMap() {
    _markers.clear();
    var currentLocation = findLocation();
    _markers.bounds.extend(currentLocation);
    // TODO: we're sorting in two locations...probably shouldn't do that.
    $.each(sortByDistanceFromLocation(_markets.openNow(), currentLocation), function (idx, stop) {
      _markers.add(stop);
    });
    $.each(sortByDistanceFromLocation(_markets.openLater(), currentLocation), function (idx, stop) {
      _markers.add(stop);
    });
  }

  function resize() {
    $("#map_canvas").height($(window).height() - $("#topBar").height()-20);
    $("#sidebar").height($(window).height() - $("#topBar").height()-20);
    $("#listContainer").height($(window).height() - $("#topBar").height()-20);
  }

  function enableNavs() {
    if ($("#open-today-li").hasClass("active")) {
      $("#navTabs").removeClass("hidden");
    } else {
      $("#navTabs").addClass('hidden');
    }
  }

  function setupPills() {
    $('a.pill-link').on('shown.bs.tab', function (e) {
      var dataSet = activeDataSet()
      enableNavs();
      reload(dataSet, function(modelPayload) {
        _markets = new Markets(modelPayload);
        refreshViewData();
      })

    });
  }

  function setupGlobalEventHandlers() {
    $(window).resize(function () {
      resize();
    });
    $('a[href="#nowMarkets"]').click(function (e) {
      e.preventDefault()
      $(this).tab('show')
    });
    $('a[href="#laterMarkets"]').click(function (e) {
      e.preventDefault()
      $(this).tab('show')
    });
    $("#about-link").click(function(e) {
      e.preventDefault();
      $('#about-dialog').modal({ show: true, keyboard: true, backdrop: true});
    })
    setupPills();
  }

  function displayWarningIfMarkersNotVisible() {
    if (!_markets.hasActive()) {
      flash("There are no farmers' markets open right now.");
    } else if (_markets.allVisible()) {
      hideFlash();
    } else {
      flash("The result list is currently being filtered based on the zoom-level and center of the map.  To see all farmers' markets, zoom out.", "warning")
    }
  }

  function findCenter(defaultCenter) {
    var lat = getCookie("map_center_lat"), lng = getCookie("map_center_lng");
    if (lat && lng) {
      return new google.maps.LatLng(lat, lng);
    }
    return defaultCenter;
  }

  function saveCenter(center) {
    setCookie("map_center_lat", center.lat());
    setCookie("map_center_lng", center.lng());
    _center = center;
  }

  function findZoom(defaultZoom) {
    var zoom = getCookie("zoom");
    if (zoom) {
      return parseInt(zoom);
    }
    return defaultZoom;
  }

  function saveZoom(zoom) {
    setCookie("zoom", zoom);
  }


  function displayListOnly() {
    return (Modernizr.touch && window.screen.width < 1024);
  }

  function displayMessageOfTheDay(model) {
    var id = getCookie("motd");
    if (model["message"] && (id != model["message"]["id"])) {
      $("#motd-message").html(model["message"]["message"]);
      $("#motd").removeClass("hidden");
      $('#motd').on('closed.bs.alert', function (e) {
        setCookie("motd", model["message"]["id"])
      });
    }
  }

  function activeDataSet() {
    if ($("#open-today-li").hasClass("active")) {
      var now = _displayForDate, year = now.getYear() + 1900, month = now.getMonth() + 1, day = now.getDate();
      return year+'-'+month+'-'+day;
    }
    return 'allmarkets';
  }

  function reload(dataSet, successFunc) {
    console.log("Reloading model...")
    var self = this;

    $.ajax({
      url: '/schedules/' + dataSet + '.json',
      dataType: 'json',
      cache: false,
      error: function () {
        try {
          console.log("Failed to reload model at " + (new Date()));
          successFunc({"markets":[]})
        } catch (e) {
          console.log(e);
        }
      },
      success: function (data) {
        try {
          console.log("Successfully loaded model at " + (new Date()));
          successFunc(data);
        } catch (e) {
          console.log(e);
        }
      }
    });
  }

  return {
    setModel: function (model) {
      _markets = new Markets(model);
      refreshViewData();
    },
    getModel: function() {
      return _markets;
    },
    reload: function (dataSet) {
      var self = this;
      reload(dataSet, function(modelPayload) {
        self.setModel(modelPayload);
      })
    },
    hideFlash: function() {
      hideFlash();
    },
    flash: function(msg, type) {
      flash(msg, type);
    },
    extend: function () {
      _map.fitBounds(_markers.bounds);
    },
    run: function (center, onDate) {
      var self = this;
      _center = findCenter(center);
      resize();
      _displayForDate = onDate;
      enableNavs();
      reload(activeDataSet(), function(modelPayload) {
        if (displayListOnly()) {
          _mobile = true;
          $("#map_wrapper").css("display", "none");
          setupPills();
          if (Modernizr.geolocation) {
            navigator.geolocation.getCurrentPosition(function (position) {
              _center = new google.maps.LatLng(position.coords.latitude,
                  position.coords.longitude);
              self.setModel(modelPayload);
            }, function () {
              self.setModel(modelPayload);
            });
          } else {
            self.setModel(modelPayload);
          }
        } else {
          _markers = new Markers();
          _map = new google.maps.Map(document.getElementById("map_canvas"), {
            zoom: findZoom(11),
            center: _center,
            maxZoom: 18,
            mapTypeId: google.maps.MapTypeId.ROADMAP
          });
          _markets = new Markets(modelPayload);
          google.maps.event.addListener(_map, 'center_changed', function () {
            saveCenter(_map.getCenter());
            displayWarningIfMarkersNotVisible();
          });
          var centerMarker = new google.maps.Marker({
            icon: "http://maps.google.com/mapfiles/arrow.png"
          });

          google.maps.event.addListener(_map, 'drag', function () {
            centerMarker.setMap(_map);
            centerMarker.setPosition(_map.getCenter());
          });
          setupGlobalEventHandlers();

          var listener = null;
          // just want to invoke this once, for when the map first loads
          listener = google.maps.event.addListener(_map, 'bounds_changed', function () {
            self.setModel(modelPayload);
            if (listener) {
              google.maps.event.removeListener(listener);
            }
          });
          google.maps.event.addListener(_map, 'dragend', function () {
            centerMarker.setMap(null);
            refreshViewData();
          });


          google.maps.event.addListener(_map, 'zoom_changed', function () {
            saveZoom(_map.getZoom());
            refreshViewData();
          });

          if (Modernizr.geolocation) {
            navigator.geolocation.getCurrentPosition(function (position) {
              var latLng = new google.maps.LatLng(position.coords.latitude,
                  position.coords.longitude),
                  distance = google.maps.geometry.spherical.computeDistanceBetween(center,
                  latLng, 3959);
              // sanity check.  Don't pan beyond 60 miles from default center
              if (distance < 60) {
                saveCenter(latLng);
                // refresh the distances
                _map.panTo(_center);
                refreshViewData();
              }
            }, function () {
            });
          }
        }
      });
    }
  };
}();
