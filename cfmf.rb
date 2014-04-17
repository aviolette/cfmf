require 'sinatra'

get '/' do
  if params[:date]
    @year,@mon,@day = params[:date].split('-')
  end
  @active = params[:active] && params[:active] == 'all' ? 'all' : 'today'
  erb :index
end

get '/markets' do
  erb :markets
end