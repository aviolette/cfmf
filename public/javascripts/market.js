var FarmersMarketFinder = function () {
  var _map = null,
      _appKey = null,
      _trucks = null,
      _mobile = false,
      _markers = null,
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
    updateTruckLists();
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
      var code = letter.charCodeAt(0);
      if (code > 90) {
        code = code - 26;
        color = "_orange"
      }
      letter = String.fromCharCode(code);
      return "http://www.google.com/mapfiles/marker" + color + letter + ".png"
    }

    this.clear = function () {
      color = "", lastLetter = 0;
      this.bounds = new google.maps.LatLngBounds();
      $.each(markers, function (key, marker) {
        marker.setMap(null);
      });
      markers = {};
    };

    this.add = function (stop) {
      if (markers[stop.location.name] == undefined) {
        var letterId = String.fromCharCode(65 + lastLetter);
        stop.marker = new google.maps.Marker({
          map: _map,
          icon: buildIconURL(letterId),
          position: stop.position
        });
        stop.markerId = "marker" + color + letterId;
        markers[stop.location.name] = stop.marker;
        lastLetter++;
        this.bounds.extend(stop.position);
      } else {
        stop.marker = markers[stop.location.name];
      }
    };
  };

  var Clock = {
    now: function () {
      return new Date().getTime();
    }
  };

  var Trucks = function (model) {
    this.stops = [];
    this.trucks = {};
    var self = this;
    for (var i = 0; i < model["trucks"].length; i++) {
      this.trucks[model["trucks"][i]["id"]] = model["trucks"][i];
    }

    $.each(model["stops"], function (idx, item) {
      self.stops.push(buildStop(item));
    });

    function buildStop(stop) {
      return {
        stop: stop,
        truck: self.trucks[stop["truckId"]],
        location: model["locations"][stop["location"] - 1],
        position: new google.maps.LatLng(model["locations"][stop["location"] - 1].latitude,
            model["locations"][stop["location"] - 1].longitude)
      }
    }

    this.findTruck = function (truckId) {
      return this.trucks[truckId];
    };

    this.findStopsForTruck = function (truckId) {
      var items = [];
      $.each(self.stops, function (idx, item) {
        if (item.stop["truckId"] == truckId) {
          items.push(item);
        }
      });
      return items;
    };

    this.all = function () {
      return this.stops;
    };

    this.updateDistanceFrom = function (location) {
      $.each(this.stops, function (idx, stop) {
        var distance = google.maps.geometry.spherical.computeDistanceBetween(location,
            stop.position, 3959);
        stop.distance = Math.round(distance * 100) / 100;
      });
    };

    this.allVisible = function () {
      if (isMobile()) {
        return true;
      }
      var bounds = _map.getBounds(), visible = true;
      $.each(this.stops, function (idx, stop) {
        if (!bounds.contains(stop.position)) {
          visible = false;
        }
      });
      return visible;
    };

    this.hasActive = function() {
      return self.stops.length > 0;
    };

    this.openNow = function () {
      var now = Clock.now(), items = [];
      $.each(self.stops, function (idx, item) {
        if (item.stop["startMillis"] <= now && item.stop["endMillis"] > now && (isMobile() || _map.getBounds().contains(item.position))) {
          items.push(item);
        }
      });
      return items;
    };

    this.openLater = function () {
      var now = Clock.now(), items = [];
      $.each(self.stops, function (idx, item) {
        if (item.stop["startMillis"] > now && (isMobile() || _map.getBounds().contains(item.position))) {
          items.push(item);
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

  function buildGroupTableRow(stop) {
    return "<div class='media'><a href='/trucks/" + stop.truck.id + "' class='pull-left'><img src='" + stop.truck.iconUrl + "'/></a><div class='media-body' >" +
        "<div><strong>" + stop.truck.name + "</strong></div><div>" + buildTimeRange(stop.stop, Clock.now()) + " </div></div></div>";
  }

  function buildInfoWindow(marker, stops) {
    var contentString = "<div class='infoWindowContent'><address class='locationName'>" +
        stops[0].location.name + "</address>";
    if (stops.distance != null) {
      contentString += "<p>" + stops[0].distance + " miles from your location</p>"
    }
    contentString = contentString + "<div class='media-list'>"
    $.each(stops, function (idx, stop) {
      contentString += buildGroupTableRow(stop);
    });
    contentString = contentString + "</div></div>";
    var infowindow = new google.maps.InfoWindow({
      content: contentString
    });

    google.maps.event.addListener(marker, 'click', function () {
      infowindow.open(_map, marker);
    });
  }

  function buildTimeRange(stop, time) {
    if (stop.startMillis < time && stop.endMillis > time) {
      return "Estimated departure time: " + stop.endTime;
    } else {
      return stop.startTime + " - " + stop.endTime;
    }
  }

  function buildTruckList($truckList, stops) {
    $truckList.empty();
    var $items = $("<ul class='media-list'></ul>"), lastIcon = null, now = Clock.now(),
        $location, $div, markerIds =[], lastMarkerGroup;
    $items.appendTo($truckList);
    $.each(stops, function (idx, stop) {
      var $locationDescription = $("<div></div>");
      if (stop.location.url) $locationDescription.append("<div><a href='" + stop.location.url + "'>" + stop.location.url + "</a></div>");
      if (stop.location.description) $locationDescription.append("<div>" + stop.location.description + " </div>");
      if (!isMobile()) {
        if (stop.distance) $locationDescription.append("<div>(" + stop.distance + " miles from map center)</div>");
        if (lastIcon != stop.marker.icon) {
          $div = $("<div class='media-body'><h4><a href='/locations/" + stop.location.key + "'>" + formatLocation(stop.location.name) + "</a></h4></div>");
          $div.append($locationDescription);
          $location = $("<li class='media'><a class='pull-left' href='#'><img id='" + stop.markerId + "' class='media-object' src='"
              + stop.marker.icon +"'/></a></li>");
          $location.append($div);
          $items.append($location);
          lastMarkerGroup = {marker: stop.marker, id: stop.markerId, stops: [stop]};
          markerIds.push(lastMarkerGroup);
        } else {
          lastMarkerGroup["stops"].push(stop);
        }
        lastIcon = stop.marker.icon;
      } else {
        if (stop.distance) $locationDescription.append("<div>(" + stop.distance + " miles away)</div>");
        $div = $("<div class='media-body'><h4><a href='/locations/" + stop.location.key + "'>" + formatLocation(stop.location.name) + "</a></h4></div>");
        $div.append($locationDescription);
        $location = $("<li class='media'></li>");
        $location.append($div);
        $items.append($location);
      }
      var toolTipId = "tooltip-" + $truckList.attr("id") +  idx,
          tooltipHtml = '';
      if (stop.stop.notes && stop.stop.notes.length > 0) {
        tooltipHtml = " <a id='" + toolTipId + "' href='#' data-toggle='tooltip' " +
        "data-placement='top' data-content=''>[?]</a>";
      }

      $div.append($("<div class='media'><a class='pull-left truckLink' truck-id='" + stop.truck.id
          +"' href='#'><img class='media-object' src='"
          + stop.truck.iconUrl +"'/></a><div class='media-body'><strong>" + stop.truck.name + "</strong><div>"
          + buildTimeRange(stop.stop, now)
          +"</div><div>Confidence: " + stop.stop.confidence + tooltipHtml +"</div>"
          + "</div></div>"));
      if (stop.stop.notes && stop.stop.notes.length > 0) {
        $("#"+ toolTipId).tooltip({"html": true, "title" :  "<ul><li class='tooltip-li'>" + stop.stop.notes.join("</li><li class='tooltip-li'>") + "</li></ul>"});
      }
    });
    $("a.truckLink").each(function (idx, item) {
      var $item = $(item), truckId = $item.attr("truck-id");
      if (isMobile()) {
        $item.attr("href", "http://twitter.com/" + _trucks.findTruck(truckId).twitterHandle);
      } else {
        $item.off('click');
        $item.click(function (e) {
          e.preventDefault();
          buildTruckDialog(_trucks.findTruck(truckId));
          return false;
        })
      }
    });
    if (!isMobile()) {
      $.each(markerIds, function (idx, markerAndId) {
        if (markerAndId.marker.getAnimation() != null) {
          return;
        }
        buildInfoWindow(markerAndId.marker, markerAndId.stops);
        $("#" + markerAndId.id).click(function (e) {
          e.preventDefault();
          markerAndId.marker.setAnimation(google.maps.Animation.BOUNCE);
          setTimeout(function () {
            markerAndId.marker.setAnimation(null);
          }, 3000);
        });

      });
    }
  }

  function updateTruckLists() {
    var location = findLocation(),
        nowTrucks = sortByDistanceFromLocation(_trucks.openNow(), location),
        laterTrucks = sortByDistanceFromLocation(_trucks.openLater(), location);
    if (nowTrucks.length == 0 && laterTrucks.length == 0) {
      $(".trucksListHeader").css("display", "none");
      $("#navTabs").css("display", "none");
      $(".truckDL").empty();
    } else {
      $(".trucksListHeader").css("display", "block");
      $("#navTabs").css("display", "block");
      buildTruckList($("#nowTrucks"), nowTrucks);
      buildTruckList($("#laterTrucks"), laterTrucks);
      if (nowTrucks.length == 0) {
        $('a[href="#laterTrucks"]').tab('show');
      }
    }
  }

  function updateDistanceFromCurrentLocation() {
    _trucks.updateDistanceFrom(findLocation());
  }

  function sortByDistanceFromLocation(stops, location) {
    return stops.sort(function (a, b) {
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
    $.each(sortByDistanceFromLocation(_trucks.openNow(), currentLocation), function (idx, stop) {
      _markers.add(stop);
    });
    $.each(sortByDistanceFromLocation(_trucks.openLater(), currentLocation), function (idx, stop) {
      _markers.add(stop);
    });
  }

  function resize() {
    $("#map_canvas").height($(window).height() - $("#topBar").height()-20);
    $("#sidebar").height($(window).height() - $("#topBar").height()-20);
    $("#listContainer").height($(window).height() - $("#topBar").height()-20);
  }

  function setupGlobalEventHandlers() {
    $(window).resize(function () {
      resize();
    });
    $('a[href="#nowTrucks"]').click(function (e) {
      e.preventDefault()
      $(this).tab('show')
    });
    $('a[href="#laterTrucks"]').click(function (e) {
      e.preventDefault()
      $(this).tab('show')
    });
  }

  function displayWarningIfMarkersNotVisible() {
    if (!_trucks.hasActive()) {
      flash("There are no food trucks on the road right now.");
    } else if (_trucks.allVisible()) {
      hideFlash();
    } else {
      flash("The result list is currently being filtered based on the zoom-level and center of the map.  To see all trucks, zoom out.", "warning")
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

  function buildTruckDialog(truck) {
    var $truckDialog = $("#truckDialog");
    $("#truckIcon").attr("src", truck.iconUrl);
    var $truckSocial = $("#truckSocial");
    $truckSocial.empty();
    $("#truck-url").empty();
    $("#truckInfoLink").attr("href", "/trucks/" + truck.id);
    if (truck.twitterHandle) {
      $truckSocial.append("<a target='_blank' href='http://twitter.com/" + truck.twitterHandle +
          "'><img alt='@" +
          truck.twitterHandle + "' src='/img/twitter32x32.png'/></a> ");
    }
    if (truck.foursquare) {
      $truckSocial.append("<a target='_blank' href='http://foursquare.com/venue/" +
          truck.foursquare +
          "'><img alt='Checkin on foursquare' src='/img/foursquare32x32.png'/></a> ");
    }
    if (truck.facebook) {
      $truckSocial.append("<a target='_blank' href='http://facebook.com" + truck.facebook +
          "'><img alt='" +
          truck.facebook + "' src='/img/facebook32x32.png'/></a> ");
    }
    var $truckInfo = $("#truckInfo");
    $truckInfo.empty();
    if (truck.url) {
      $("#truck-url").append("<a class='whitelink' target='_blank' href='" + truck.url + "'>" +
          truck.url + "</a>").removeClass("hidden");
    } else {
      $("#truck-url").addClass("hidden");
    }
    var $truckSchedule = $("#truckSchedule");
    $truckSchedule.empty();
    $.each(_trucks.findStopsForTruck(truck.id), function (idx, stop) {
      var $tr = $("<tr></tr>");
      $tr.append("<td>" + stop.stop.startTime + "</td>");
      $tr.append("<td>" + stop.location.name + "</td>")
      $truckSchedule.append($tr);
    });
    $("#truckTitle").html(truck.name);
    $truckDialog.modal({ show: true, keyboard: true, backdrop: true});
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

  return {
    setModel: function (model) {
//      _trucks = new Trucks(model);
//      refreshViewData();
    },
    openTruck: function (truckId) {
      buildTruckDialog(_trucks.findTruck(truckId));
    },
    reload: function () {
      console.log("Reloading model...")
      var self = this;
      $.ajax({
        url: '/services/daily_schedule?appKey=' + _appKey + '&from=' + Clock.now(),
        dataType: 'json',
        cache: false,
        error: function () {
          try {
            console.log("Failed to reload model at " + (new Date()));
          } catch (e) {}
        },
        success: function (data) {
          try {
            console.log("Successfully loaded model at " + (new Date()));
          } catch (e) {}
          self.setModel(data);
        }
      });
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
    run: function (mobile, center, time, modelPayload, appKey) {
      var self = this;
      _appKey = appKey;
      _center = findCenter(center);
      resize();
      displayMessageOfTheDay(modelPayload);
      if (displayListOnly() || mobile) {
        _mobile = true;
        $("#map_wrapper").css("display", "none");
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

        google.maps.event.addListener(_map, 'dragend', function () {
          centerMarker.setMap(null);
          self.setModel(modelPayload);
        });

        google.maps.event.addListener(_map, 'zoom_changed', function () {
          saveZoom(_map.getZoom());
          self.setModel(modelPayload);
        });
        var listener = null;
        // just want to invoke this once, for when the map first loads
        listener = google.maps.event.addListener(_map, 'bounds_changed', function () {
          self.setModel(modelPayload);
          if (listener) {
            google.maps.event.removeListener(listener);
          }
        });
        setupGlobalEventHandlers();

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
      // reload the model every 5 minutes
      setInterval(function () {
        self.reload();
      }, 300000)
    }
  };
}();
